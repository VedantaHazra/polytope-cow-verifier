FROM golang:1.21-bullseye
WORKDIR /app

# Install Z3 and C++ build tools
RUN apt-get update && apt-get install -y z3 libz3-dev g++ make

# Copy the mod file and download the dependencies
COPY go.mod ./
RUN go mod download

# --- THE APPLE SILICON / CGO SHARED LIBRARY FIX ---
# 1. Unlock the read-only Go module cache
RUN chmod -R +w /go/pkg/mod/github.com/mitchellh/go-z3@*

# 2. Surgically edit the hardcoded library path in the Z3 source code to use the dynamic Linux system library instead
RUN sed -i 's|${SRCDIR}/libz3.a|-lz3|g' /go/pkg/mod/github.com/mitchellh/go-z3@*/z3.go
# --------------------------------------------------

# Copy the rest of the code
COPY . .

# Explicitly enable CGO and build
ENV CGO_ENABLED=1
RUN go build -o polytope main.go

EXPOSE 8080
CMD ["./polytope"]