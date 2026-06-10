package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/mitchellh/go-z3"
)

type ASTNode struct {
	Operator   string   `json:"operator,omitempty"`
	SourceText string   `json:"source_text,omitempty"`
	Var        string   `json:"var,omitempty"`
	Value      int64    `json:"value,omitempty"` // Strictly int64 for Web3
	BoolVal    *bool    `json:"bool_val,omitempty"`
	Left       *ASTNode `json:"left,omitempty"`
	Right      *ASTNode `json:"right,omitempty"`
}

type ASTConfig struct {
	Protocol string    `json:"protocol"`
	Rules    []ASTNode `json:"rules"`
}

type AuditRecord struct {
	Timestamp string `json:"timestamp"`
	Hash      string `json:"hash"`
	Status    string `json:"status"`
	Action    string `json:"action"`
	Reason    string `json:"reason,omitempty"`
}

var (
	ActiveConfig ASTConfig
	auditLedger  []AuditRecord
	mutex        sync.Mutex
	isShadowMode bool = false

	// Global Z3 Environment (Heavy lift done once)
	z3Config *z3.Config
	z3Ctx    *z3.Context
)

// CoW Protocol Pre-Flight Invariants
var CoWSettlementPolicy = []byte(`{
  "protocol": "CoW Protocol GPv2",
  "rules": [
    {
      "operator": "GTE",
      "source_text": "Slippage Invariant: The executed buy amount must be greater than or equal to the user's limit buy amount.",
      "left": { "var": "executed_buy_amount" }, 
      "right": { "var": "limit_buy_amount" }
    },
    {
      "operator": "EQ",
      "source_text": "Uniform Clearing Price: The batch must respect uniform clearing prices across all overlapping trades.",
      "left": { "var": "clearing_price_valid" },
      "right": { "bool_val": true }
    },
    {
      "operator": "GTE",
      "source_text": "Fee Coverage: The solver must attach sufficient network fee to cover execution.",
      "left": { "var": "fee_attached" },
      "right": { "var": "network_base_fee" }
    }
  ]
}`)

func initZ3() {
	z3Config = z3.NewConfig()
	z3Ctx = z3.NewContext(z3Config)
}

func loadPolicy() {
	json.Unmarshal(CoWSettlementPolicy, &ActiveConfig)
	fmt.Printf("\n[SYSTEM] CoW Protocol Invariants Loaded | Rules Active: %d\n", len(ActiveConfig.Rules))
}

func init() {
	initZ3()
	loadPolicy()
}

func getLedgerHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	mutex.Lock()
	json.NewEncoder(w).Encode(auditLedger)
	mutex.Unlock()
}

func toggleShadowMode(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
	if r.Method == "OPTIONS" { w.WriteHeader(http.StatusOK); return }

	mutex.Lock()
	isShadowMode = !isShadowMode
	modeStr := "ENFORCEMENT (BLOCKING)"
	if isShadowMode { modeStr = "SHADOW (MONITOR ONLY)" }
	fmt.Printf("\n[SYSTEM] NODE MODE SWITCHED TO: %s\n", modeStr)
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"shadow_mode": isShadowMode})
	mutex.Unlock()
}

func buildZ3Node(node *ASTNode, ctx *z3.Context, payload map[string]interface{}) (*z3.AST, string) {
	intSort := ctx.IntSort()

	if node.Var != "" {
		if val, exists := payload[node.Var]; exists {
			switch v := val.(type) {
			case bool:
				if v { return ctx.True(), "bool" }
				return ctx.False(), "bool"
			case float64: // JSON numbers decode to float64 by default in Go
				return ctx.Int(int(v), intSort), "int"
			}
		}
		// Default fallback if payload misses data
		return ctx.Int(0, intSort), "int"
	}

	if node.BoolVal != nil {
		if *node.BoolVal { return ctx.True(), "bool" }
		return ctx.False(), "bool"
	}
	
	if node.Left == nil && node.Right == nil && node.Var == "" {
		return ctx.Int(int(node.Value), intSort), "int"
	}

	var leftAST, rightAST *z3.AST

	// Blank identifiers (_) replace the unused leftType and rightType strings
	if node.Left != nil { leftAST, _ = buildZ3Node(node.Left, ctx, payload) }
	if node.Right != nil { rightAST, _ = buildZ3Node(node.Right, ctx, payload) }

	switch node.Operator {
	case "AND": return leftAST.And(rightAST), "bool"
	case "GTE": return leftAST.Ge(rightAST), "bool"
	case "LTE": return leftAST.Le(rightAST), "bool"
	case "EQ":  return leftAST.Eq(rightAST), "bool"
	default:    return ctx.True(), "bool"
	}
}

func EvaluateASTMatrix(payload map[string]interface{}) (bool, string) {
	// Generate a fresh solver from the global context for every request. 
	// This is extremely fast and avoids the Push/Pop library limitation.
	s := z3Ctx.NewSolver()

	for _, rule := range ActiveConfig.Rules {
		ruleMath, _ := buildZ3Node(&rule, z3Ctx, payload)
		s.Assert(ruleMath)

		if s.Check() != z3.True { 
			return false, fmt.Sprintf("Constraint Failure: %s", rule.SourceText) 
		}
	}
	return true, "Batch Satisfies All Invariants"
}

func ProxyHandler(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	if r.Method == "OPTIONS" { w.WriteHeader(http.StatusOK); return }

	w.Header().Set("Content-Type", "application/json")
	bodyBytes, _ := io.ReadAll(r.Body)
	r.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))

	var payload map[string]interface{}
	if err := json.Unmarshal(bodyBytes, &payload); err == nil {
		
		solverID := "Unknown Solver"
		if id, ok := payload["solver_address"].(string); ok { solverID = id }
		
		isSafe, reason := EvaluateASTMatrix(payload)
		latency := time.Since(start)

		status := "VERIFIED"
		if !isSafe {
			if isShadowMode { status = "SHADOW_BLOCKED (Allowed)" } else { status = "REVERT_PREVENTED" }
		}

		hashBytes := sha256.Sum256([]byte(fmt.Sprintf("%v|%v|%v", payload, status, time.Now().UnixNano())))
		hashStr := hex.EncodeToString(hashBytes[:16])

		record := AuditRecord{
			Timestamp: time.Now().Format("15:04:05.000"),
			Hash:      hashStr,
			Status:    status,
			Action:    fmt.Sprintf("Batch Evaluation: %s", solverID),
			Reason:    reason,
		}

		mutex.Lock()
		auditLedger = append([]AuditRecord{record}, auditLedger...)
		mutex.Unlock()

		if status == "REVERT_PREVENTED" || status == "SHADOW_BLOCKED (Allowed)" {
			fmt.Printf("\n[UNSAT] BATCH REJECTED: %s\n", reason)
			fmt.Printf("    |- Hash: %s | Latency: %s\n", hashStr, latency)
		} else {
			fmt.Printf("\n[SAT] BATCH CLEARED | Latency: %s\n", latency)
		}

		if !isSafe && !isShadowMode {
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "POLYTOPE_INVARIANT_VIOLATION",
				"reason": reason,
			})
			return 
		}

		w.WriteHeader(http.StatusOK)
		if !isSafe && isShadowMode {
			json.NewEncoder(w).Encode(map[string]string{
				"status": "shadow_blocked",
				"reason": reason,
			})
			return
		}

		json.NewEncoder(w).Encode(map[string]string{"status": "success"})
		return
	}
	w.WriteHeader(http.StatusBadRequest)
}

func main() {
	http.HandleFunc("/api/ledger", getLedgerHandler)
	http.HandleFunc("/api/toggle-mode", toggleShadowMode)
	http.HandleFunc("/", ProxyHandler) 
	
	fmt.Println("Polytope Pre-Flight Verification Node Active on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}