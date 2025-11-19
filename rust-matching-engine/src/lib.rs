//! # CLOB Matching Engine
//!
//! A high-performance, memory-safe, and deterministic Central Limit Order Book (CLOB)
//! matching engine for prediction markets.
//!
//! ## Architecture: Price Level Book
//!
//! This implementation uses a Price Level Book architecture that enforces strict
//! Price-Time Priority:
//!
//! - **Price Priority**: Best price always matches first (highest bid, lowest ask)
//! - **Time Priority**: At the same price level, orders are processed FIFO
//!
//! ### Data Structures
//!
//! - `BTreeMap<Price, PriceLevelQueue>`: Sorted price levels (O(log P) operations)
//! - `VecDeque<Order>`: FIFO queue at each price level (O(1) front operations)
//! - `HashMap<OrderId, OrderMetadata>`: O(1) order lookup for cancellations
//!
//! ### Cancellation Strategy: Lazy Deletion
//!
//! This implementation uses **Lazy Deletion** for order cancellation:
//!
//! - Orders are marked as cancelled in the HashMap (O(1))
//! - Cancelled orders are skipped during matching iteration
//! - Empty price levels are cleaned up after matching
//!
//! **Rationale**: Lazy deletion provides better average-case performance because:
//! 1. Cancellation is O(1) instead of O(N) for VecDeque removal
//! 2. Most orders in active markets are either filled or cancelled quickly
//! 3. The overhead of skipping cancelled orders during matching is minimal
//! 4. Memory cleanup happens naturally during the matching phase
//!
//! ## Fixed-Point Arithmetic
//!
//! All prices and quantities use `u64` to avoid floating-point precision issues:
//! - Prices are in basis points (e.g., $0.65 = 6500 basis points)
//! - Quantities are whole units (shares)

use std::collections::{BTreeMap, HashMap, VecDeque};
use std::time::{SystemTime, UNIX_EPOCH};

/// Price represented in basis points (1 basis point = 0.0001)
/// Example: $0.65 = 6500 basis points
pub type Price = u64;

/// Quantity of shares (whole units)
pub type Quantity = u64;

/// Unique order identifier
pub type OrderId = u64;

/// Unique trade identifier
pub type TradeId = u64;

/// Timestamp in microseconds since UNIX epoch
pub type Timestamp = u64;

/// Market identifier
pub type MarketId = String;

/// Outcome identifier (e.g., "YES", "NO")
pub type OutcomeId = String;

/// User identifier
pub type UserId = String;

/// Side of the order (Buy or Sell)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Side {
    Buy,
    Sell,
}

impl std::fmt::Display for Side {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Side::Buy => write!(f, "BUY"),
            Side::Sell => write!(f, "SELL"),
        }
    }
}

/// Order status
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OrderStatus {
    /// Order is active and can be matched
    Open,
    /// Order has been partially filled
    PartiallyFilled,
    /// Order has been completely filled
    Filled,
    /// Order has been cancelled
    Cancelled,
}

/// A limit order in the order book
#[derive(Debug, Clone)]
pub struct Order {
    /// Unique order identifier
    pub id: OrderId,
    /// User who placed the order
    pub user_id: UserId,
    /// Market this order belongs to
    pub market_id: MarketId,
    /// Outcome this order is for (e.g., "YES" or "NO")
    pub outcome_id: OutcomeId,
    /// Buy or Sell
    pub side: Side,
    /// Price in basis points
    pub price: Price,
    /// Original quantity
    pub original_quantity: Quantity,
    /// Remaining quantity to be filled
    pub remaining_quantity: Quantity,
    /// When the order was placed (microseconds since epoch)
    pub timestamp: Timestamp,
    /// Current status
    pub status: OrderStatus,
}

impl Order {
    /// Create a new order
    pub fn new(
        id: OrderId,
        user_id: UserId,
        market_id: MarketId,
        outcome_id: OutcomeId,
        side: Side,
        price: Price,
        quantity: Quantity,
    ) -> Self {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_micros() as u64;

        Self {
            id,
            user_id,
            market_id,
            outcome_id,
            side,
            price,
            original_quantity: quantity,
            remaining_quantity: quantity,
            timestamp,
            status: OrderStatus::Open,
        }
    }

    /// Create a new order with explicit timestamp (useful for testing)
    pub fn with_timestamp(
        id: OrderId,
        user_id: UserId,
        market_id: MarketId,
        outcome_id: OutcomeId,
        side: Side,
        price: Price,
        quantity: Quantity,
        timestamp: Timestamp,
    ) -> Self {
        Self {
            id,
            user_id,
            market_id,
            outcome_id,
            side,
            price,
            original_quantity: quantity,
            remaining_quantity: quantity,
            timestamp,
            status: OrderStatus::Open,
        }
    }

    /// Check if this order can match with another order
    pub fn can_match(&self, other: &Order) -> bool {
        // Must be opposite sides
        if self.side == other.side {
            return false;
        }

        // Must be same market and outcome
        if self.market_id != other.market_id || self.outcome_id != other.outcome_id {
            return false;
        }

        // Prevent self-trading
        if self.user_id == other.user_id {
            return false;
        }

        // Check price compatibility
        match self.side {
            Side::Buy => self.price >= other.price, // Buyer willing to pay at least seller's price
            Side::Sell => self.price <= other.price, // Seller willing to accept at most buyer's price
        }
    }
}

/// A trade execution record
#[derive(Debug, Clone)]
pub struct Trade {
    /// Unique trade identifier
    pub id: TradeId,
    /// The aggressive order (taker)
    pub taker_order_id: OrderId,
    /// The passive order (maker)
    pub maker_order_id: OrderId,
    /// User who placed the taker order
    pub taker_user_id: UserId,
    /// User who placed the maker order
    pub maker_user_id: UserId,
    /// Market this trade belongs to
    pub market_id: MarketId,
    /// Outcome this trade is for
    pub outcome_id: OutcomeId,
    /// Execution price (maker's price)
    pub price: Price,
    /// Executed quantity
    pub quantity: Quantity,
    /// When the trade was executed
    pub timestamp: Timestamp,
    /// Which side the taker was on
    pub taker_side: Side,
}

/// Metadata for order lookup (used in the HashMap for O(1) access)
#[derive(Debug, Clone)]
struct OrderMetadata {
    /// Price level where this order resides
    price: Price,
    /// Current status (for lazy deletion)
    status: OrderStatus,
    /// Remaining quantity
    remaining_quantity: Quantity,
}

/// A queue of orders at a specific price level
#[derive(Debug, Default)]
struct PriceLevelQueue {
    /// Orders at this price level in FIFO order
    orders: VecDeque<Order>,
    /// Total quantity available at this price level
    total_quantity: Quantity,
}

impl PriceLevelQueue {
    /// Create a new empty price level queue
    fn new() -> Self {
        Self {
            orders: VecDeque::new(),
            total_quantity: 0,
        }
    }

    /// Add an order to the back of the queue
    fn push_back(&mut self, order: Order) {
        self.total_quantity += order.remaining_quantity;
        self.orders.push_back(order);
    }

    /// Check if the queue is empty
    fn is_empty(&self) -> bool {
        self.orders.is_empty()
    }

    /// Get a mutable reference to the front order
    fn front_mut(&mut self) -> Option<&mut Order> {
        self.orders.front_mut()
    }

    /// Remove the front order
    fn pop_front(&mut self) -> Option<Order> {
        if let Some(order) = self.orders.pop_front() {
            self.total_quantity = self.total_quantity.saturating_sub(order.remaining_quantity);
            Some(order)
        } else {
            None
        }
    }

    /// Update total quantity after a partial fill
    fn update_quantity(&mut self, filled: Quantity) {
        self.total_quantity = self.total_quantity.saturating_sub(filled);
    }

    /// Clean up cancelled orders from the front of the queue
    /// Returns the number of orders removed
    fn cleanup_cancelled(&mut self, order_index: &HashMap<OrderId, OrderMetadata>) -> usize {
        let mut removed = 0;
        while let Some(front) = self.orders.front() {
            if let Some(metadata) = order_index.get(&front.id) {
                if metadata.status == OrderStatus::Cancelled {
                    self.orders.pop_front();
                    removed += 1;
                    continue;
                }
            }
            break;
        }
        removed
    }
}

/// The Central Limit Order Book
#[derive(Debug)]
pub struct OrderBook {
    /// Market this order book is for
    pub market_id: MarketId,
    /// Outcome this order book is for
    pub outcome_id: OutcomeId,
    /// Buy orders sorted by price (highest first when iterating in reverse)
    bids: BTreeMap<Price, PriceLevelQueue>,
    /// Sell orders sorted by price (lowest first when iterating)
    asks: BTreeMap<Price, PriceLevelQueue>,
    /// O(1) lookup for all orders (active and cancelled)
    order_index: HashMap<OrderId, OrderMetadata>,
    /// Next trade ID
    next_trade_id: TradeId,
    /// Statistics
    pub total_trades: u64,
    pub total_volume: Quantity,
}

/// Error types for order book operations
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OrderBookError {
    /// Order ID already exists
    DuplicateOrderId(OrderId),
    /// Order not found
    OrderNotFound(OrderId),
    /// Order already cancelled
    OrderAlreadyCancelled(OrderId),
    /// Order already filled
    OrderAlreadyFilled(OrderId),
    /// Invalid price (must be > 0)
    InvalidPrice,
    /// Invalid quantity (must be > 0)
    InvalidQuantity,
    /// Market/outcome mismatch
    MarketMismatch,
}

impl std::fmt::Display for OrderBookError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DuplicateOrderId(id) => write!(f, "Duplicate order ID: {}", id),
            Self::OrderNotFound(id) => write!(f, "Order not found: {}", id),
            Self::OrderAlreadyCancelled(id) => write!(f, "Order already cancelled: {}", id),
            Self::OrderAlreadyFilled(id) => write!(f, "Order already filled: {}", id),
            Self::InvalidPrice => write!(f, "Invalid price (must be > 0)"),
            Self::InvalidQuantity => write!(f, "Invalid quantity (must be > 0)"),
            Self::MarketMismatch => write!(f, "Market or outcome mismatch"),
        }
    }
}

impl std::error::Error for OrderBookError {}

/// Result of processing an order
#[derive(Debug)]
pub struct ProcessOrderResult {
    /// Trades that were executed
    pub trades: Vec<Trade>,
    /// The order after processing (may be fully filled, partially filled, or open)
    pub order: Order,
}

impl OrderBook {
    /// Create a new order book for a specific market and outcome
    pub fn new(market_id: MarketId, outcome_id: OutcomeId) -> Self {
        Self {
            market_id,
            outcome_id,
            bids: BTreeMap::new(),
            asks: BTreeMap::new(),
            order_index: HashMap::new(),
            next_trade_id: 1,
            total_trades: 0,
            total_volume: 0,
        }
    }

    /// Get the best bid price (highest buy price)
    pub fn best_bid(&self) -> Option<Price> {
        self.bids.keys().next_back().copied()
    }

    /// Get the best ask price (lowest sell price)
    pub fn best_ask(&self) -> Option<Price> {
        self.asks.keys().next().copied()
    }

    /// Get the spread between best bid and best ask
    pub fn spread(&self) -> Option<Price> {
        match (self.best_bid(), self.best_ask()) {
            (Some(bid), Some(ask)) if ask > bid => Some(ask - bid),
            _ => None,
        }
    }

    /// Get total quantity at a specific price level on the bid side
    pub fn bid_quantity_at(&self, price: Price) -> Quantity {
        self.bids
            .get(&price)
            .map(|q| q.total_quantity)
            .unwrap_or(0)
    }

    /// Get total quantity at a specific price level on the ask side
    pub fn ask_quantity_at(&self, price: Price) -> Quantity {
        self.asks
            .get(&price)
            .map(|q| q.total_quantity)
            .unwrap_or(0)
    }

    /// Get the number of price levels on the bid side
    pub fn bid_levels(&self) -> usize {
        self.bids.len()
    }

    /// Get the number of price levels on the ask side
    pub fn ask_levels(&self) -> usize {
        self.asks.len()
    }

    /// Get the total number of active orders
    pub fn active_orders(&self) -> usize {
        self.order_index
            .values()
            .filter(|m| m.status == OrderStatus::Open || m.status == OrderStatus::PartiallyFilled)
            .count()
    }

    /// Process a limit order: match against existing orders, then add remainder to book
    ///
    /// # Time Complexity
    /// - Best case (no match): O(log P) for BTreeMap insertion
    /// - Average case: O(log P + M) where M is number of matched orders
    /// - Worst case: O(log P + N) where N is total orders on opposite side
    pub fn process_limit_order(&mut self, mut order: Order) -> Result<ProcessOrderResult, OrderBookError> {
        // Validate order
        if order.price == 0 {
            return Err(OrderBookError::InvalidPrice);
        }
        if order.remaining_quantity == 0 {
            return Err(OrderBookError::InvalidQuantity);
        }
        if order.market_id != self.market_id || order.outcome_id != self.outcome_id {
            return Err(OrderBookError::MarketMismatch);
        }
        if self.order_index.contains_key(&order.id) {
            return Err(OrderBookError::DuplicateOrderId(order.id));
        }

        let mut trades = Vec::new();

        // Match against opposite side
        match order.side {
            Side::Buy => {
                self.match_buy_order(&mut order, &mut trades);
            }
            Side::Sell => {
                self.match_sell_order(&mut order, &mut trades);
            }
        }

        // Add remainder to book if not fully filled
        if order.remaining_quantity > 0 {
            self.add_to_book(order.clone());
        }

        // Update statistics
        self.total_trades += trades.len() as u64;
        self.total_volume += trades.iter().map(|t| t.quantity).sum::<u64>();

        Ok(ProcessOrderResult { trades, order })
    }

    /// Match a buy order against asks (lowest ask first)
    fn match_buy_order(&mut self, order: &mut Order, trades: &mut Vec<Trade>) {
        // Get price levels to match (lowest ask first)
        let price_levels: Vec<Price> = self
            .asks
            .keys()
            .filter(|&&ask_price| ask_price <= order.price)
            .copied()
            .collect();

        for ask_price in price_levels {
            if order.remaining_quantity == 0 {
                break;
            }

            // Match against orders at this price level
            loop {
                if order.remaining_quantity == 0 {
                    break;
                }

                // Get level and check front order
                let level = match self.asks.get_mut(&ask_price) {
                    Some(l) => l,
                    None => break,
                };

                // Clean up cancelled orders at the front
                level.cleanup_cancelled(&self.order_index);

                // Extract maker data to avoid borrow conflicts
                let maker_data = match level.front_mut() {
                    Some(maker) => {
                        // Check if cancelled
                        if let Some(metadata) = self.order_index.get(&maker.id) {
                            if metadata.status == OrderStatus::Cancelled {
                                level.pop_front();
                                continue;
                            }
                        }
                        // Prevent self-trading
                        if maker.user_id == order.user_id {
                            break;
                        }
                        // Extract data needed for trade
                        Some((
                            maker.id,
                            maker.user_id.clone(),
                            maker.market_id.clone(),
                            maker.outcome_id.clone(),
                            maker.price,
                            maker.remaining_quantity,
                        ))
                    }
                    None => None,
                };

                let (maker_id, maker_user_id, market_id, outcome_id, maker_price, maker_remaining) =
                    match maker_data {
                        Some(data) => data,
                        None => break,
                    };

                // Calculate fill quantity
                let fill_quantity = order.remaining_quantity.min(maker_remaining);

                // Create trade
                let trade_id = self.next_trade_id;
                self.next_trade_id += 1;

                let timestamp = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_micros() as u64;

                let trade = Trade {
                    id: trade_id,
                    taker_order_id: order.id,
                    maker_order_id: maker_id,
                    taker_user_id: order.user_id.clone(),
                    maker_user_id,
                    market_id,
                    outcome_id,
                    price: maker_price,
                    quantity: fill_quantity,
                    timestamp,
                    taker_side: order.side,
                };
                trades.push(trade);

                // Update taker
                order.remaining_quantity -= fill_quantity;

                // Update maker in the queue
                let new_maker_remaining = maker_remaining - fill_quantity;
                if let Some(level) = self.asks.get_mut(&ask_price) {
                    if let Some(maker) = level.front_mut() {
                        maker.remaining_quantity = new_maker_remaining;
                        if new_maker_remaining == 0 {
                            maker.status = OrderStatus::Filled;
                        } else {
                            maker.status = OrderStatus::PartiallyFilled;
                        }
                    }
                    level.update_quantity(fill_quantity);

                    // Remove fully filled orders
                    if new_maker_remaining == 0 {
                        level.pop_front();
                    }
                }

                // Update maker in index
                if let Some(metadata) = self.order_index.get_mut(&maker_id) {
                    metadata.remaining_quantity = new_maker_remaining;
                    if new_maker_remaining == 0 {
                        metadata.status = OrderStatus::Filled;
                    } else {
                        metadata.status = OrderStatus::PartiallyFilled;
                    }
                }
            }

            // Clean up empty price levels
            if self.asks.get(&ask_price).is_some_and(|l| l.is_empty()) {
                self.asks.remove(&ask_price);
            }
        }

        // Update taker order status
        if order.remaining_quantity == 0 {
            order.status = OrderStatus::Filled;
        } else if order.remaining_quantity < order.original_quantity {
            order.status = OrderStatus::PartiallyFilled;
        }
    }

    /// Match a sell order against bids (highest bid first)
    fn match_sell_order(&mut self, order: &mut Order, trades: &mut Vec<Trade>) {
        // Get price levels to match (highest bid first)
        let price_levels: Vec<Price> = self
            .bids
            .keys()
            .rev()
            .filter(|&&bid_price| bid_price >= order.price)
            .copied()
            .collect();

        for bid_price in price_levels {
            if order.remaining_quantity == 0 {
                break;
            }

            // Match against orders at this price level
            loop {
                if order.remaining_quantity == 0 {
                    break;
                }

                // Get level and check front order
                let level = match self.bids.get_mut(&bid_price) {
                    Some(l) => l,
                    None => break,
                };

                // Clean up cancelled orders at the front
                level.cleanup_cancelled(&self.order_index);

                // Extract maker data to avoid borrow conflicts
                let maker_data = match level.front_mut() {
                    Some(maker) => {
                        // Check if cancelled
                        if let Some(metadata) = self.order_index.get(&maker.id) {
                            if metadata.status == OrderStatus::Cancelled {
                                level.pop_front();
                                continue;
                            }
                        }
                        // Prevent self-trading
                        if maker.user_id == order.user_id {
                            break;
                        }
                        // Extract data needed for trade
                        Some((
                            maker.id,
                            maker.user_id.clone(),
                            maker.market_id.clone(),
                            maker.outcome_id.clone(),
                            maker.price,
                            maker.remaining_quantity,
                        ))
                    }
                    None => None,
                };

                let (maker_id, maker_user_id, market_id, outcome_id, maker_price, maker_remaining) =
                    match maker_data {
                        Some(data) => data,
                        None => break,
                    };

                // Calculate fill quantity
                let fill_quantity = order.remaining_quantity.min(maker_remaining);

                // Create trade
                let trade_id = self.next_trade_id;
                self.next_trade_id += 1;

                let timestamp = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_micros() as u64;

                let trade = Trade {
                    id: trade_id,
                    taker_order_id: order.id,
                    maker_order_id: maker_id,
                    taker_user_id: order.user_id.clone(),
                    maker_user_id,
                    market_id,
                    outcome_id,
                    price: maker_price,
                    quantity: fill_quantity,
                    timestamp,
                    taker_side: order.side,
                };
                trades.push(trade);

                // Update taker
                order.remaining_quantity -= fill_quantity;

                // Update maker in the queue
                let new_maker_remaining = maker_remaining - fill_quantity;
                if let Some(level) = self.bids.get_mut(&bid_price) {
                    if let Some(maker) = level.front_mut() {
                        maker.remaining_quantity = new_maker_remaining;
                        if new_maker_remaining == 0 {
                            maker.status = OrderStatus::Filled;
                        } else {
                            maker.status = OrderStatus::PartiallyFilled;
                        }
                    }
                    level.update_quantity(fill_quantity);

                    // Remove fully filled orders
                    if new_maker_remaining == 0 {
                        level.pop_front();
                    }
                }

                // Update maker in index
                if let Some(metadata) = self.order_index.get_mut(&maker_id) {
                    metadata.remaining_quantity = new_maker_remaining;
                    if new_maker_remaining == 0 {
                        metadata.status = OrderStatus::Filled;
                    } else {
                        metadata.status = OrderStatus::PartiallyFilled;
                    }
                }
            }

            // Clean up empty price levels
            if self.bids.get(&bid_price).is_some_and(|l| l.is_empty()) {
                self.bids.remove(&bid_price);
            }
        }

        // Update taker order status
        if order.remaining_quantity == 0 {
            order.status = OrderStatus::Filled;
        } else if order.remaining_quantity < order.original_quantity {
            order.status = OrderStatus::PartiallyFilled;
        }
    }

    /// Add an order to the appropriate side of the book
    fn add_to_book(&mut self, order: Order) {
        let price = order.price;
        let order_id = order.id;
        let remaining = order.remaining_quantity;
        let status = order.status;

        let book = match order.side {
            Side::Buy => &mut self.bids,
            Side::Sell => &mut self.asks,
        };

        book.entry(price)
            .or_insert_with(PriceLevelQueue::new)
            .push_back(order);

        // Add to index
        self.order_index.insert(
            order_id,
            OrderMetadata {
                price,
                status,
                remaining_quantity: remaining,
            },
        );
    }

    /// Cancel an order using lazy deletion
    ///
    /// # Time Complexity
    /// O(1) - Just marks the order as cancelled in the HashMap
    ///
    /// The order remains in the VecDeque but will be skipped during matching
    /// and cleaned up when encountered.
    pub fn cancel_order(&mut self, order_id: OrderId) -> Result<(), OrderBookError> {
        let metadata = self
            .order_index
            .get_mut(&order_id)
            .ok_or(OrderBookError::OrderNotFound(order_id))?;

        match metadata.status {
            OrderStatus::Cancelled => {
                return Err(OrderBookError::OrderAlreadyCancelled(order_id));
            }
            OrderStatus::Filled => {
                return Err(OrderBookError::OrderAlreadyFilled(order_id));
            }
            _ => {
                // Mark as cancelled (lazy deletion)
                metadata.status = OrderStatus::Cancelled;
                metadata.remaining_quantity = 0;
            }
        }

        Ok(())
    }

    /// Force cleanup of a cancelled order and its price level if empty
    ///
    /// This is optional - cancelled orders are naturally cleaned up during matching.
    /// Use this for explicit cleanup when needed.
    ///
    /// # Time Complexity
    /// O(N) where N is the number of orders at the price level
    pub fn cleanup_cancelled_order(&mut self, order_id: OrderId) -> Result<(), OrderBookError> {
        let metadata = self
            .order_index
            .get(&order_id)
            .ok_or(OrderBookError::OrderNotFound(order_id))?;

        if metadata.status != OrderStatus::Cancelled {
            return Ok(()); // Nothing to clean up
        }

        let price = metadata.price;

        // Try to find and remove from bids
        if let Some(level) = self.bids.get_mut(&price) {
            level.orders.retain(|o| o.id != order_id);
            level.total_quantity = level.orders.iter().map(|o| o.remaining_quantity).sum();
            if level.is_empty() {
                self.bids.remove(&price);
            }
            self.order_index.remove(&order_id);
            return Ok(());
        }

        // Try to find and remove from asks
        if let Some(level) = self.asks.get_mut(&price) {
            level.orders.retain(|o| o.id != order_id);
            level.total_quantity = level.orders.iter().map(|o| o.remaining_quantity).sum();
            if level.is_empty() {
                self.asks.remove(&price);
            }
            self.order_index.remove(&order_id);
            return Ok(());
        }

        Ok(())
    }

    /// Get order status
    pub fn get_order_status(&self, order_id: OrderId) -> Option<OrderStatus> {
        self.order_index.get(&order_id).map(|m| m.status)
    }

    /// Get remaining quantity for an order
    pub fn get_order_remaining(&self, order_id: OrderId) -> Option<Quantity> {
        self.order_index.get(&order_id).map(|m| m.remaining_quantity)
    }

    /// Get a snapshot of the top N levels of the order book
    pub fn get_depth(&self, levels: usize) -> (Vec<(Price, Quantity)>, Vec<(Price, Quantity)>) {
        let bids: Vec<(Price, Quantity)> = self
            .bids
            .iter()
            .rev()
            .take(levels)
            .map(|(&price, level)| (price, level.total_quantity))
            .collect();

        let asks: Vec<(Price, Quantity)> = self
            .asks
            .iter()
            .take(levels)
            .map(|(&price, level)| (price, level.total_quantity))
            .collect();

        (bids, asks)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_order(
        id: OrderId,
        user_id: &str,
        side: Side,
        price: Price,
        quantity: Quantity,
        timestamp: Timestamp,
    ) -> Order {
        Order::with_timestamp(
            id,
            user_id.to_string(),
            "market1".to_string(),
            "YES".to_string(),
            side,
            price,
            quantity,
            timestamp,
        )
    }

    #[test]
    fn test_liquidity_addition() {
        let mut book = OrderBook::new("market1".to_string(), "YES".to_string());

        // Add multiple buy orders at different prices
        let order1 = create_test_order(1, "user1", Side::Buy, 5000, 100, 1000);
        let order2 = create_test_order(2, "user2", Side::Buy, 5500, 200, 2000);
        let order3 = create_test_order(3, "user3", Side::Buy, 5000, 150, 3000);

        book.process_limit_order(order1).unwrap();
        book.process_limit_order(order2).unwrap();
        book.process_limit_order(order3).unwrap();

        // Verify book depth
        assert_eq!(book.bid_levels(), 2);
        assert_eq!(book.bid_quantity_at(5000), 250); // 100 + 150
        assert_eq!(book.bid_quantity_at(5500), 200);
        assert_eq!(book.best_bid(), Some(5500));

        // Add sell orders
        let order4 = create_test_order(4, "user4", Side::Sell, 6000, 100, 4000);
        let order5 = create_test_order(5, "user5", Side::Sell, 6500, 200, 5000);

        book.process_limit_order(order4).unwrap();
        book.process_limit_order(order5).unwrap();

        assert_eq!(book.ask_levels(), 2);
        assert_eq!(book.best_ask(), Some(6000));
        assert_eq!(book.spread(), Some(500)); // 6000 - 5500
        assert_eq!(book.active_orders(), 5);
    }

    #[test]
    fn test_full_fill() {
        let mut book = OrderBook::new("market1".to_string(), "YES".to_string());

        // Add a sell order
        let sell_order = create_test_order(1, "seller", Side::Sell, 5000, 100, 1000);
        book.process_limit_order(sell_order).unwrap();

        // Add a matching buy order
        let buy_order = create_test_order(2, "buyer", Side::Buy, 5000, 100, 2000);
        let result = book.process_limit_order(buy_order).unwrap();

        // Verify trade
        assert_eq!(result.trades.len(), 1);
        assert_eq!(result.trades[0].quantity, 100);
        assert_eq!(result.trades[0].price, 5000);
        assert_eq!(result.order.status, OrderStatus::Filled);

        // Verify book is empty
        assert_eq!(book.bid_levels(), 0);
        assert_eq!(book.ask_levels(), 0);
        assert_eq!(book.active_orders(), 0);
    }

    #[test]
    fn test_partial_fill() {
        let mut book = OrderBook::new("market1".to_string(), "YES".to_string());

        // Add a sell order
        let sell_order = create_test_order(1, "seller", Side::Sell, 5000, 100, 1000);
        book.process_limit_order(sell_order).unwrap();

        // Add a larger buy order
        let buy_order = create_test_order(2, "buyer", Side::Buy, 5000, 150, 2000);
        let result = book.process_limit_order(buy_order).unwrap();

        // Verify partial fill
        assert_eq!(result.trades.len(), 1);
        assert_eq!(result.trades[0].quantity, 100);
        assert_eq!(result.order.remaining_quantity, 50);
        assert_eq!(result.order.status, OrderStatus::PartiallyFilled);

        // Verify remaining order on book
        assert_eq!(book.bid_levels(), 1);
        assert_eq!(book.bid_quantity_at(5000), 50);
        assert_eq!(book.ask_levels(), 0);
    }

    #[test]
    fn test_multi_level_match() {
        let mut book = OrderBook::new("market1".to_string(), "YES".to_string());

        // Add multiple sell orders at different prices
        let sell1 = create_test_order(1, "seller1", Side::Sell, 5000, 100, 1000);
        let sell2 = create_test_order(2, "seller2", Side::Sell, 5100, 100, 2000);
        let sell3 = create_test_order(3, "seller3", Side::Sell, 5200, 100, 3000);

        book.process_limit_order(sell1).unwrap();
        book.process_limit_order(sell2).unwrap();
        book.process_limit_order(sell3).unwrap();

        assert_eq!(book.ask_levels(), 3);

        // Add a large buy order that consumes multiple levels
        let buy_order = create_test_order(4, "buyer", Side::Buy, 5200, 250, 4000);
        let result = book.process_limit_order(buy_order).unwrap();

        // Verify all trades
        assert_eq!(result.trades.len(), 3);

        // First trade at lowest price
        assert_eq!(result.trades[0].price, 5000);
        assert_eq!(result.trades[0].quantity, 100);

        // Second trade at middle price
        assert_eq!(result.trades[1].price, 5100);
        assert_eq!(result.trades[1].quantity, 100);

        // Third trade at highest price (partial)
        assert_eq!(result.trades[2].price, 5200);
        assert_eq!(result.trades[2].quantity, 50);

        // Verify remaining state
        assert_eq!(result.order.status, OrderStatus::Filled);
        assert_eq!(book.ask_levels(), 1);
        assert_eq!(book.ask_quantity_at(5200), 50);
    }

    #[test]
    fn test_price_time_priority() {
        let mut book = OrderBook::new("market1".to_string(), "YES".to_string());

        // Add two sell orders at the same price (earlier order should match first)
        let sell1 = create_test_order(1, "seller1", Side::Sell, 5000, 100, 1000);
        let sell2 = create_test_order(2, "seller2", Side::Sell, 5000, 100, 2000);

        book.process_limit_order(sell1).unwrap();
        book.process_limit_order(sell2).unwrap();

        // Add a buy order that partially fills
        let buy_order = create_test_order(3, "buyer", Side::Buy, 5000, 150, 3000);
        let result = book.process_limit_order(buy_order).unwrap();

        // Verify FIFO: first trade should be with seller1
        assert_eq!(result.trades.len(), 2);
        assert_eq!(result.trades[0].maker_order_id, 1);
        assert_eq!(result.trades[0].quantity, 100);

        // Second trade with seller2 (partial)
        assert_eq!(result.trades[1].maker_order_id, 2);
        assert_eq!(result.trades[1].quantity, 50);

        // Verify seller1 is fully filled, seller2 has remainder
        assert_eq!(book.get_order_status(1), Some(OrderStatus::Filled));
        assert_eq!(book.get_order_status(2), Some(OrderStatus::PartiallyFilled));
        assert_eq!(book.get_order_remaining(2), Some(50));
    }

    #[test]
    fn test_price_priority() {
        let mut book = OrderBook::new("market1".to_string(), "YES".to_string());

        // Add sell orders at different prices
        let sell_high = create_test_order(1, "seller1", Side::Sell, 6000, 100, 1000);
        let sell_low = create_test_order(2, "seller2", Side::Sell, 5000, 100, 2000);

        book.process_limit_order(sell_high).unwrap();
        book.process_limit_order(sell_low).unwrap();

        // Buy order should match with lower price first
        let buy_order = create_test_order(3, "buyer", Side::Buy, 6000, 150, 3000);
        let result = book.process_limit_order(buy_order).unwrap();

        // Verify price priority: lower ask matches first
        assert_eq!(result.trades.len(), 2);
        assert_eq!(result.trades[0].price, 5000);
        assert_eq!(result.trades[0].maker_order_id, 2);
        assert_eq!(result.trades[1].price, 6000);
        assert_eq!(result.trades[1].maker_order_id, 1);
    }

    #[test]
    fn test_cancellation() {
        let mut book = OrderBook::new("market1".to_string(), "YES".to_string());

        // Add orders
        let order1 = create_test_order(1, "user1", Side::Sell, 5000, 100, 1000);
        let order2 = create_test_order(2, "user2", Side::Sell, 5000, 100, 2000);

        book.process_limit_order(order1).unwrap();
        book.process_limit_order(order2).unwrap();

        assert_eq!(book.ask_quantity_at(5000), 200);

        // Cancel first order
        book.cancel_order(1).unwrap();
        assert_eq!(book.get_order_status(1), Some(OrderStatus::Cancelled));

        // Verify the cancelled order is skipped during matching
        let buy_order = create_test_order(3, "buyer", Side::Buy, 5000, 50, 3000);
        let result = book.process_limit_order(buy_order).unwrap();

        // Should match with order 2, not the cancelled order 1
        assert_eq!(result.trades.len(), 1);
        assert_eq!(result.trades[0].maker_order_id, 2);
    }

    #[test]
    fn test_cancellation_cleanup() {
        let mut book = OrderBook::new("market1".to_string(), "YES".to_string());

        // Add a single order
        let order = create_test_order(1, "user1", Side::Sell, 5000, 100, 1000);
        book.process_limit_order(order).unwrap();

        assert_eq!(book.ask_levels(), 1);

        // Cancel and cleanup
        book.cancel_order(1).unwrap();
        book.cleanup_cancelled_order(1).unwrap();

        // Verify empty price level is removed
        assert_eq!(book.ask_levels(), 0);
    }

    #[test]
    fn test_cancel_nonexistent_order() {
        let mut book = OrderBook::new("market1".to_string(), "YES".to_string());

        let result = book.cancel_order(999);
        assert_eq!(result, Err(OrderBookError::OrderNotFound(999)));
    }

    #[test]
    fn test_cancel_already_cancelled() {
        let mut book = OrderBook::new("market1".to_string(), "YES".to_string());

        let order = create_test_order(1, "user1", Side::Sell, 5000, 100, 1000);
        book.process_limit_order(order).unwrap();
        book.cancel_order(1).unwrap();

        let result = book.cancel_order(1);
        assert_eq!(result, Err(OrderBookError::OrderAlreadyCancelled(1)));
    }

    #[test]
    fn test_cancel_filled_order() {
        let mut book = OrderBook::new("market1".to_string(), "YES".to_string());

        // Add and fill an order
        let sell_order = create_test_order(1, "seller", Side::Sell, 5000, 100, 1000);
        book.process_limit_order(sell_order).unwrap();

        let buy_order = create_test_order(2, "buyer", Side::Buy, 5000, 100, 2000);
        book.process_limit_order(buy_order).unwrap();

        // Try to cancel the filled order
        let result = book.cancel_order(1);
        assert_eq!(result, Err(OrderBookError::OrderAlreadyFilled(1)));
    }

    #[test]
    fn test_self_trading_prevention() {
        let mut book = OrderBook::new("market1".to_string(), "YES".to_string());

        // Add a sell order
        let sell_order = create_test_order(1, "user1", Side::Sell, 5000, 100, 1000);
        book.process_limit_order(sell_order).unwrap();

        // Try to match with own order
        let buy_order = create_test_order(2, "user1", Side::Buy, 5000, 100, 2000);
        let result = book.process_limit_order(buy_order).unwrap();

        // No trades should occur
        assert_eq!(result.trades.len(), 0);
        assert_eq!(result.order.remaining_quantity, 100);

        // Both orders should be on the book
        assert_eq!(book.bid_levels(), 1);
        assert_eq!(book.ask_levels(), 1);
    }

    #[test]
    fn test_duplicate_order_id() {
        let mut book = OrderBook::new("market1".to_string(), "YES".to_string());

        let order1 = create_test_order(1, "user1", Side::Sell, 5000, 100, 1000);
        book.process_limit_order(order1).unwrap();

        let order2 = create_test_order(1, "user2", Side::Sell, 5500, 100, 2000);
        let result = book.process_limit_order(order2);

        assert!(matches!(result, Err(OrderBookError::DuplicateOrderId(1))));
    }

    #[test]
    fn test_invalid_price() {
        let mut book = OrderBook::new("market1".to_string(), "YES".to_string());

        let order = create_test_order(1, "user1", Side::Sell, 0, 100, 1000);
        let result = book.process_limit_order(order);

        assert!(matches!(result, Err(OrderBookError::InvalidPrice)));
    }

    #[test]
    fn test_invalid_quantity() {
        let mut book = OrderBook::new("market1".to_string(), "YES".to_string());

        let mut order = create_test_order(1, "user1", Side::Sell, 5000, 0, 1000);
        order.remaining_quantity = 0;
        let result = book.process_limit_order(order);

        assert!(matches!(result, Err(OrderBookError::InvalidQuantity)));
    }

    #[test]
    fn test_market_mismatch() {
        let mut book = OrderBook::new("market1".to_string(), "YES".to_string());

        let mut order = create_test_order(1, "user1", Side::Sell, 5000, 100, 1000);
        order.market_id = "market2".to_string();
        let result = book.process_limit_order(order);

        assert!(matches!(result, Err(OrderBookError::MarketMismatch)));
    }

    #[test]
    fn test_bid_priority_highest_first() {
        let mut book = OrderBook::new("market1".to_string(), "YES".to_string());

        // Add buy orders at different prices
        let buy_low = create_test_order(1, "buyer1", Side::Buy, 5000, 100, 1000);
        let buy_high = create_test_order(2, "buyer2", Side::Buy, 6000, 100, 2000);

        book.process_limit_order(buy_low).unwrap();
        book.process_limit_order(buy_high).unwrap();

        // Sell order should match with highest bid first
        let sell_order = create_test_order(3, "seller", Side::Sell, 5000, 150, 3000);
        let result = book.process_limit_order(sell_order).unwrap();

        // Verify: highest bid matches first
        assert_eq!(result.trades.len(), 2);
        assert_eq!(result.trades[0].price, 6000);
        assert_eq!(result.trades[0].maker_order_id, 2);
        assert_eq!(result.trades[1].price, 5000);
        assert_eq!(result.trades[1].maker_order_id, 1);
    }

    #[test]
    fn test_get_depth() {
        let mut book = OrderBook::new("market1".to_string(), "YES".to_string());

        // Add bids
        let bid1 = create_test_order(1, "user1", Side::Buy, 5000, 100, 1000);
        let bid2 = create_test_order(2, "user2", Side::Buy, 5100, 200, 2000);
        let bid3 = create_test_order(3, "user3", Side::Buy, 5200, 150, 3000);

        // Add asks
        let ask1 = create_test_order(4, "user4", Side::Sell, 5500, 100, 4000);
        let ask2 = create_test_order(5, "user5", Side::Sell, 5600, 200, 5000);

        book.process_limit_order(bid1).unwrap();
        book.process_limit_order(bid2).unwrap();
        book.process_limit_order(bid3).unwrap();
        book.process_limit_order(ask1).unwrap();
        book.process_limit_order(ask2).unwrap();

        let (bids, asks) = book.get_depth(2);

        // Bids should be highest first
        assert_eq!(bids.len(), 2);
        assert_eq!(bids[0], (5200, 150));
        assert_eq!(bids[1], (5100, 200));

        // Asks should be lowest first
        assert_eq!(asks.len(), 2);
        assert_eq!(asks[0], (5500, 100));
        assert_eq!(asks[1], (5600, 200));
    }

    #[test]
    fn test_statistics() {
        let mut book = OrderBook::new("market1".to_string(), "YES".to_string());

        // Add and match orders
        let sell = create_test_order(1, "seller", Side::Sell, 5000, 100, 1000);
        book.process_limit_order(sell).unwrap();

        let buy = create_test_order(2, "buyer", Side::Buy, 5000, 100, 2000);
        book.process_limit_order(buy).unwrap();

        assert_eq!(book.total_trades, 1);
        assert_eq!(book.total_volume, 100);
    }

    #[test]
    fn test_large_order_multiple_makers() {
        let mut book = OrderBook::new("market1".to_string(), "YES".to_string());

        // Add 5 sell orders at same price
        for i in 1..=5 {
            let order = create_test_order(i, &format!("seller{}", i), Side::Sell, 5000, 100, i * 1000);
            book.process_limit_order(order).unwrap();
        }

        assert_eq!(book.ask_quantity_at(5000), 500);

        // Large buy order
        let buy = create_test_order(10, "buyer", Side::Buy, 5000, 350, 10000);
        let result = book.process_limit_order(buy).unwrap();

        // Should have 4 trades (3 full + 1 partial)
        assert_eq!(result.trades.len(), 4);
        assert_eq!(result.order.status, OrderStatus::Filled);

        // Verify FIFO order
        assert_eq!(result.trades[0].maker_order_id, 1);
        assert_eq!(result.trades[1].maker_order_id, 2);
        assert_eq!(result.trades[2].maker_order_id, 3);
        assert_eq!(result.trades[3].maker_order_id, 4);
        assert_eq!(result.trades[3].quantity, 50);

        // Remaining on book
        assert_eq!(book.ask_quantity_at(5000), 150); // 50 from order 4 + 100 from order 5
    }

    #[test]
    fn test_no_match_price_gap() {
        let mut book = OrderBook::new("market1".to_string(), "YES".to_string());

        // Add sell order at high price
        let sell = create_test_order(1, "seller", Side::Sell, 7000, 100, 1000);
        book.process_limit_order(sell).unwrap();

        // Add buy order at low price (no match)
        let buy = create_test_order(2, "buyer", Side::Buy, 5000, 100, 2000);
        let result = book.process_limit_order(buy).unwrap();

        assert_eq!(result.trades.len(), 0);
        assert_eq!(book.bid_levels(), 1);
        assert_eq!(book.ask_levels(), 1);
        assert_eq!(book.spread(), Some(2000));
    }
}
