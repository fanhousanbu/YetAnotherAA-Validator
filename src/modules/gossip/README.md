# Gossip Protocol Implementation

This module implements a gossip protocol for distributed peer-to-peer
communication in the BLS signer network. The gossip protocol replaces the
previous WebSocket-based P2P implementation with a more robust and scalable
approach.

## Overview

The gossip protocol is a probabilistic communication protocol that ensures
eventual consistency across a distributed network. It works by having nodes
periodically exchange information with randomly selected peers, similar to how
rumors spread in social networks.

## Key Features

- **Decentralized Communication**: No central coordinator required
- **Eventual Consistency**: All nodes eventually receive all data
- **Fault Tolerance**: Handles node failures gracefully
- **Scalability**: Efficient even with large numbers of nodes
- **Message Deduplication**: Prevents message loops and duplicates
- **Health Monitoring**: Tracks peer health and removes inactive peers
- **Single Port Architecture**: WebSocket gossip shares the same port as HTTP
  API

## Architecture

### Core Components

1. **GossipService**: Main service that handles protocol logic
2. **GossipController**: REST API endpoints for monitoring and control
3. **GossipModule**: NestJS module configuration
4. **Interfaces**: TypeScript interfaces for type safety

### Message Types

- `join`: Announces a new node joining the network
- `leave`: Announces a node leaving the network
- `gossip`: Propagates data updates across the network
- `sync`: Synchronizes state between nodes
- `heartbeat`: Keeps track of node health

### Configuration

The gossip protocol can be configured via environment variables:

```bash
# Gossip Protocol Configuration
GOSSIP_PUBLIC_URL=ws://localhost:3001/ws  # This node's gossip WebSocket URL
GOSSIP_BOOTSTRAP_PEERS=ws://peer1:3001/ws,ws://peer2:3002/ws  # Initial peers
GOSSIP_INTERVAL=5000                # Gossip round interval (ms)
GOSSIP_FANOUT=3                     # Number of peers to gossip to each round
GOSSIP_MAX_TTL=5                    # Maximum message propagation hops
GOSSIP_HEARTBEAT_INTERVAL=10000     # Heartbeat frequency (ms)
GOSSIP_SUSPICION_TIMEOUT=30000      # Time before marking peer as suspected (ms)
GOSSIP_CLEANUP_TIMEOUT=60000        # Time before removing inactive peers (ms)
GOSSIP_MAX_MESSAGE_HISTORY=1000     # Maximum messages to keep in history
```

## API Endpoints

### GET /gossip/peers

Get all known active peers in the gossip network.

### GET /gossip/stats

Get gossip network statistics including message counts and peer counts.

### GET /gossip/data

Get all gossip data stored in the local node.

### GET /gossip/data/:key

Get specific data by key from the gossip state.

### POST /gossip/data

Set key-value data that will be propagated through the gossip network.

### GET /gossip/state

Get the current node state including version and data.

### GET /gossip/health

Get health status of the gossip service.

## Usage Examples

### Setting Data

```bash
curl -X POST http://localhost:3001/gossip/data \
  -H "Content-Type: application/json" \
  -d '{"key": "node-status", "value": {"status": "active", "timestamp": 1234567890}}'
```

### Getting Data

```bash
curl http://localhost:3001/gossip/data/node-status
```

### Monitoring Network

```bash
curl http://localhost:3001/gossip/stats
curl http://localhost:3001/gossip/peers
curl http://localhost:3001/gossip/health
```

## How It Works

1. **Node Startup**: When a node starts, WebSocket gossip server starts on `/ws`
   path of the main HTTP port
2. **Peer Connection**: Nodes connect to bootstrap peers via WebSocket at
   `ws://host:port/ws`
3. **Peer Discovery**: Nodes learn about other peers through join messages and
   peer lists
4. **Gossip Rounds**: Every `GOSSIP_INTERVAL` ms, each node selects random peers
   and gossips data
5. **Message Propagation**: Messages are forwarded to other peers with
   decreasing TTL
6. **Health Monitoring**: Heartbeats track peer health, inactive peers are
   eventually removed
7. **State Synchronization**: Nodes exchange their complete state to ensure
   consistency

## Differences from Previous P2P Implementation

| Aspect                | Old P2P                      | New Gossip                        |
| --------------------- | ---------------------------- | --------------------------------- |
| Communication Pattern | Direct WebSocket connections | Probabilistic gossip rounds       |
| Consistency Model     | Immediate propagation        | Eventual consistency              |
| Failure Handling      | Connection-based             | Health monitoring with suspicion  |
| Scalability           | Limited by connection count  | Scales with network size          |
| Message Deduplication | Basic                        | Advanced with message history     |
| Data Versioning       | None                         | Version-based conflict resolution |

## Benefits

1. **Better Scalability**: Gossip protocols scale logarithmically with network
   size
2. **Improved Fault Tolerance**: Can handle network partitions and node failures
3. **Reduced Network Load**: Probabilistic propagation reduces redundant
   messages
4. **Eventual Consistency**: Guarantees all nodes will eventually have the same
   data
5. **Self-Healing**: Network automatically adapts to topology changes

## Monitoring and Debugging

Use the health endpoint to monitor the gossip network:

```bash
curl http://localhost:3001/gossip/health
```

This will show:

- Number of active/suspected peers
- Gossip statistics (rounds, messages sent/received)
- Connectivity status
- Overall health status (healthy/degraded/isolated)

## Migration from P2P

The gossip implementation maintains API compatibility with the previous P2P
implementation while providing enhanced functionality. The main differences are:

1. Configuration variables now use `GOSSIP_` prefix instead of `P2P_`
2. Additional configuration options for gossip-specific parameters
3. Enhanced statistics and monitoring capabilities
4. Improved data consistency and version management
