//! Demonstration of the CLOB Matching Engine
//!
//! Run with: cargo run --release

use matching_engine::{Order, OrderBook, Side};

fn main() {
    println!("=== CLOB Matching Engine Demo ===\n");

    // Create an order book for a prediction market
    let mut book = OrderBook::new("election-2024".to_string(), "YES".to_string());

    println!("Market: {} | Outcome: {}", book.market_id, book.outcome_id);
    println!("-----------------------------------\n");

    // Add some sell orders (makers providing liquidity)
    println!("Adding sell orders (liquidity providers):");
    let sells = vec![
        (1, "alice", 6500, 100), // $0.65, 100 shares
        (2, "bob", 6600, 150),   // $0.66, 150 shares
        (3, "charlie", 6500, 50), // $0.65, 50 shares (same price as alice)
        (4, "david", 6800, 200),  // $0.68, 200 shares
    ];

    for (id, user, price, qty) in sells {
        let order = Order::new(
            id,
            user.to_string(),
            "election-2024".to_string(),
            "YES".to_string(),
            Side::Sell,
            price,
            qty,
        );
        let result = book.process_limit_order(order).unwrap();
        println!(
            "  Order {}: {} sells {} @ {} bps - {} trades executed",
            id,
            user,
            qty,
            price,
            result.trades.len()
        );
    }

    println!("\nOrder book state:");
    print_book_state(&book);

    // Add some buy orders (makers)
    println!("\nAdding buy orders:");
    let buys = vec![
        (5, "eve", 6000, 100),   // $0.60
        (6, "frank", 6200, 75),  // $0.62
    ];

    for (id, user, price, qty) in buys {
        let order = Order::new(
            id,
            user.to_string(),
            "election-2024".to_string(),
            "YES".to_string(),
            Side::Buy,
            price,
            qty,
        );
        let result = book.process_limit_order(order).unwrap();
        println!(
            "  Order {}: {} buys {} @ {} bps - {} trades executed",
            id,
            user,
            qty,
            price,
            result.trades.len()
        );
    }

    println!("\nOrder book state:");
    print_book_state(&book);

    // Now a large aggressive buy order that crosses multiple price levels
    println!("\n=== Aggressive Buy Order ===");
    println!("Grace wants to buy 200 shares at up to $0.67 (6700 bps)");

    let aggressive_buy = Order::new(
        7,
        "grace".to_string(),
        "election-2024".to_string(),
        "YES".to_string(),
        Side::Buy,
        6700, // Willing to pay up to $0.67
        200,
    );

    let result = book.process_limit_order(aggressive_buy).unwrap();

    println!("\nTrades executed:");
    for trade in &result.trades {
        println!(
            "  Trade {}: {} shares @ {} bps (maker: order {})",
            trade.id, trade.quantity, trade.price, trade.maker_order_id
        );
    }

    println!(
        "\nOrder status: {:?}, Remaining: {}",
        result.order.status, result.order.remaining_quantity
    );

    println!("\nOrder book state after matching:");
    print_book_state(&book);

    // Demonstrate cancellation
    println!("\n=== Order Cancellation ===");
    println!("Frank cancels his buy order (ID: 6)");

    match book.cancel_order(6) {
        Ok(()) => println!("  Order 6 cancelled successfully"),
        Err(e) => println!("  Error: {}", e),
    }

    println!("\nFinal order book state:");
    print_book_state(&book);

    // Statistics
    println!("\n=== Statistics ===");
    println!("Total trades: {}", book.total_trades);
    println!("Total volume: {} shares", book.total_volume);
    println!("Active orders: {}", book.active_orders());
}

fn print_book_state(book: &OrderBook) {
    let (bids, asks) = book.get_depth(5);

    println!("  Asks (Sell side):");
    for (price, qty) in asks.iter().rev() {
        println!("    {} bps: {} shares", price, qty);
    }

    if let Some(spread) = book.spread() {
        println!("  --- Spread: {} bps ---", spread);
    } else {
        println!("  --- No spread (empty side) ---");
    }

    println!("  Bids (Buy side):");
    for (price, qty) in &bids {
        println!("    {} bps: {} shares", price, qty);
    }

    if bids.is_empty() && asks.is_empty() {
        println!("  (empty book)");
    }
}
