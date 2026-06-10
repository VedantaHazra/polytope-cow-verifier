# Polytope: Pre-Flight Verification Node for CoW Solvers

A deterministic, low-latency formal verification node designed specifically for CoW Protocol GPv2 solvers. Polytope uses the **Z3 SMT (Satisfiability Modulo Theories) solver** to mathematically validate batch settlement invariants off-chain, preventing on-chain reverts and eliminating wasted gas.

## Grant Proposal Notice

This repository contains the lightweight **Proof of Concept (PoC)** constraint engine developed as part of the Polytope CoW DAO Grant Application. It demonstrates the technical viability of sub-50ms SAT/UNSAT resolution for GPv2 settlement parameters using fixed-point integer mathematics.

## The Architecture

Independent solvers currently rely on heuristic simulation pipelines to ensure batch execution. Polytope complements these pipelines by acting as a mathematical firewall:

1. **Payload Ingestion**: The node receives the proposed batch execution JSON payload.
2. **AST Transpilation**: The data is mapped into an Abstract Syntax Tree (AST) using strict fixed-point integers (avoiding floating-point non-determinism).
3. **Z3 Evaluation**: The AST is evaluated against hardcoded CoW Protocol invariants within the Z3 context using highly optimized `Context.NewSolver()` scoping.
4. **Resolution**: The engine returns `SAT` (cleared for execution) or `UNSAT` (blocked/flagged) in milliseconds.

## Modeled Invariants (PoC)

This iteration hardcodes three fundamental CoW Protocol boundaries to demonstrate engine viability:

- **Slippage Bounds:** `executed_buy_amount >= limit_buy_amount`
- **Uniform Clearing Prices:** Ensures all overlapping trades clear at a consistent uniform rate.
- **Fee Coverage:** `fee_attached >= network_base_fee`

## Performance Benchmark

- **Local HTTP Testing:** ~25ms - 40ms
- **Target Production Latency (gRPC/Native):** <15ms
  By relying on incremental solver generation and pre-loaded contexts, Polytope strips away standard verification bloat, allowing integration into high-frequency solver workflows without introducing operational bottlenecks.

---

## 🛠 Getting Started

### Prerequisites

- Docker and Docker Compose
- _(Optional)_ Go 1.21+ (if running bare metal)

### Running the Node Locally

The easiest way to run the Polytope Node with its native C++ Z3 dependencies is via Docker.

```bash
# Clone the repository
git clone [https://github.com/YOUR_GITHUB_USERNAME/polytope-cow-verifier.git](https://github.com/YOUR_GITHUB_USERNAME/polytope-cow-verifier.git)
cd polytope-cow-verifier

# Build and start the containerized node and UI
docker compose up --build
```
