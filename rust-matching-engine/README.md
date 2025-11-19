# CLOB Matching Engine

A high-performance, memory-safe, and deterministic Central Limit Order Book (CLOB) matching engine for prediction markets, implemented in Rust.

## Features

- **Price-Time Priority**: Strict enforcement of best price first, earliest order first (FIFO)
- **Fixed-Point Arithmetic**: All prices/quantities use `u64` to avoid floating-point precision issues
- **Memory Safety**: Leverages Rust's ownership system for zero-cost abstractions
- **Deterministic**: Same inputs always produce same outputs
- **Efficient Cancellation**: O(1) lazy deletion strategy

## Architecture: Price Level Book

### Data Structure Overview

```
OrderBook
├── bids: BTreeMap<Price, PriceLevelQueue>    (Buy orders, highest first)
├── asks: BTreeMap<Price, PriceLevelQueue>    (Sell orders, lowest first)
└── order_index: HashMap<OrderId, OrderMetadata>  (O(1) lookup)

PriceLevelQueue
└── orders: VecDeque<Order>  (FIFO queue)
```

### Why This Architecture?

1. **BTreeMap for Price Levels**
   - Maintains prices in sorted order automatically
   - O(log P) insertion/lookup where P = number of price levels
   - Efficient iteration for best price matching
   - For bids: iterate in reverse (highest first)
   - For asks: iterate forward (lowest first)

2. **VecDeque for Time Priority**
   - O(1) insertion at back (new orders)
   - O(1) removal from front (filled orders)
   - Excellent cache locality for sequential access
   - Maintains FIFO order within each price level

3. **HashMap for Order Tracking**
   - O(1) order lookup for cancellations
   - O(1) status updates
   - Enables lazy deletion strategy

### Price-Time Priority Enforcement

**Price Priority**: When matching, the engine always selects the best available price:
- Buy orders match against the **lowest** ask price first
- Sell orders match against the **highest** bid price first

**Time Priority**: Within the same price level, orders are matched in FIFO order:
- Earlier orders always match before later orders
- Guaranteed by VecDeque's front-to-back processing

## Cancellation Strategy: Lazy Deletion

### Design Decision

This implementation uses **Lazy Deletion** instead of direct VecDeque removal.

### How It Works

1. When `cancel_order(id)` is called:
   - Order status is set to `Cancelled` in the HashMap (O(1))
   - Order remains in the VecDeque

2. During matching:
   - Cancelled orders are detected and skipped
   - They are removed from VecDeque when encountered at the front

3. Optional explicit cleanup:
   - `cleanup_cancelled_order(id)` removes from VecDeque (O(N))
   - Empty price levels are automatically removed

### Why Lazy Deletion?

| Approach | Cancel Time | Match Overhead | Memory |
|----------|-------------|----------------|--------|
| Direct Removal | O(N) | None | Optimal |
| Lazy Deletion | O(1) | Skip cancelled | Slightly higher |

**Lazy deletion is preferred because:**

1. **O(1) Cancellation**: Critical for high-frequency trading where cancellations are common
2. **Amortized Cleanup**: Cancelled orders are removed during normal matching operations
3. **Minimal Match Overhead**: Skipping cancelled orders is a simple status check
4. **Real-world Pattern**: Most orders are either filled or cancelled quickly, so cancelled orders don't accumulate

**Trade-offs:**
- Slightly higher memory usage (cancelled orders remain until matched)
- Small overhead checking status during matching
- Complexity of managing two states (VecDeque + HashMap)

## Time Complexity Analysis

### Core Operations

| Operation | Best Case | Average Case | Worst Case |
|-----------|-----------|--------------|------------|
| Add Limit Order (no match) | O(log P) | O(log P) | O(log P) |
| Add Limit Order (with match) | O(log P + 1) | O(log P + M) | O(log P + N) |
| Cancel Order | O(1) | O(1) | O(1) |
| Get Best Bid/Ask | O(1) | O(1) | O(1) |
| Get Order Status | O(1) | O(1) | O(1) |

Where:
- P = number of distinct price levels
- M = number of matched orders
- N = total orders on opposite side

### Detailed Breakdown

**process_limit_order():**
1. Validation: O(1)
2. Find matching price levels: O(log P)
3. Match against orders: O(M) where M = filled orders
4. Add remainder to book: O(log P)
5. Update statistics: O(1)

**cancel_order():**
1. HashMap lookup: O(1)
2. Status update: O(1)

**Matching Algorithm:**
```
For each price level (best first):          O(log P) iterations
    For each order at that level (FIFO):    O(K) where K = orders at level
        Check cancelled status: O(1)
        Calculate fill: O(1)
        Create trade: O(1)
        Update quantities: O(1)
```

## Fixed-Point Arithmetic

All monetary values use `u64` to avoid floating-point precision issues:

```rust
// Prices in basis points (1 bp = 0.0001)
// $0.65 = 6500 basis points
pub type Price = u64;

// Quantities as whole units
pub type Quantity = u64;
```

**Example conversions:**
- $0.01 = 100 basis points
- $0.50 = 5000 basis points
- $0.99 = 9900 basis points

This approach ensures:
- Exact arithmetic (no rounding errors)
- Deterministic results across platforms
- Simple comparison operations

## Usage

### Basic Example

```rust
use matching_engine::{Order, OrderBook, Side};

// Create an order book
let mut book = OrderBook::new("market1".to_string(), "YES".to_string());

// Add a sell order at $0.65
let sell = Order::new(
    1,                        // order_id
    "seller".to_string(),     // user_id
    "market1".to_string(),    // market_id
    "YES".to_string(),        // outcome_id
    Side::Sell,
    6500,                     // price in basis points
    100,                      // quantity
);
book.process_limit_order(sell)?;

// Add a matching buy order
let buy = Order::new(2, "buyer".to_string(), "market1".to_string(),
                     "YES".to_string(), Side::Buy, 6500, 100);
let result = book.process_limit_order(buy)?;

// Check trades
for trade in result.trades {
    println!("Trade: {} shares @ {} bps", trade.quantity, trade.price);
}
```

### Running the Demo

```bash
cargo run --release
```

### Running Tests

```bash
cargo test
```

## Test Coverage

The test suite covers:

1. **Liquidity Addition**: Verifying book depth and quantity aggregation
2. **Full Fills**: Complete order matching
3. **Partial Fills**: Orders partially filled with remainder on book
4. **Multi-Level Matching**: Large aggressive orders consuming multiple price levels
5. **Price-Time Priority**: FIFO verification at same price levels
6. **Price Priority**: Best price matching verification
7. **Cancellation**: Order cancellation and cleanup
8. **Edge Cases**:
   - Duplicate order IDs
   - Invalid prices/quantities
   - Market/outcome mismatch
   - Self-trading prevention
   - Cancel non-existent orders
   - Cancel already filled orders

## API Reference

### OrderBook

```rust
// Create a new order book
fn new(market_id: String, outcome_id: String) -> Self

// Process a limit order
fn process_limit_order(&mut self, order: Order) -> Result<ProcessOrderResult, OrderBookError>

// Cancel an order
fn cancel_order(&mut self, order_id: OrderId) -> Result<(), OrderBookError>

// Get best bid/ask
fn best_bid(&self) -> Option<Price>
fn best_ask(&self) -> Option<Price>
fn spread(&self) -> Option<Price>

// Get depth
fn get_depth(&self, levels: usize) -> (Vec<(Price, Quantity)>, Vec<(Price, Quantity)>)

// Statistics
fn active_orders(&self) -> usize
fn bid_levels(&self) -> usize
fn ask_levels(&self) -> usize
```

### Order

```rust
fn new(
    id: OrderId,
    user_id: UserId,
    market_id: MarketId,
    outcome_id: OutcomeId,
    side: Side,
    price: Price,
    quantity: Quantity,
) -> Self
```

## Performance Considerations

1. **Memory Allocation**: Orders are moved into the book, minimizing clones
2. **Cache Efficiency**: VecDeque provides good cache locality for matching
3. **Branch Prediction**: Common paths (no cancellation) are optimized
4. **Release Build**: Use `--release` for optimized performance with LTO enabled

## Integration with Node.js

This Rust matching engine can be integrated with the existing Node.js backend via:

1. **FFI (Foreign Function Interface)**: Using `neon` or `node-bindgen`
2. **WebAssembly**: Compile to WASM for browser/Node.js usage
3. **Subprocess**: Run as separate process with IPC
4. **gRPC/HTTP**: Run as microservice

## License

MIT
