/**
 * FreshMartDB — Portable embedded database for the FreshMart application.
 *
 * All application data (users, carts, orders, inventory, settings) lives in a
 * SINGLE JSON document persisted under one localStorage key. The entire
 * database can be exported to a .json file and imported on any other
 * machine/browser, making it fully portable.
 *
 * Collections:
 *   settings  — admin credentials, delivery configuration
 *   users     — customer accounts + saved profile (name, address, phone)
 *   carts     — per-user shopping carts
 *   orders    — all orders placed across every customer
 *   inventory — product catalog with stock levels
 */
const DB = (() => {
    const DB_KEY = 'freshmart_db';
    const DB_VERSION = 1;

    // ===== Default (seed) database =====
    function defaultData() {
        return {
            meta: {
                name: 'FreshMartDB',
                version: DB_VERSION,
                createdAt: new Date().toISOString()
            },
            settings: {
                admin: { username: 'admin', password: 'admin123' },
                deliveryFee: 4.99,
                freeDeliveryThreshold: 35
            },
            users: {},   // username -> { password, fullName, address, phone, createdAt }
            carts: {},   // username -> [ { name, emoji, price, qty } ]
            orders: [],  // { id, customer, items, total, address, name, phone, date, status }
            inventory: [
                { sku: 'FM-1001', name: 'Apples', emoji: '🍎', category: 'Produce', price: 2.99, unit: '/lb', stock: 120, reorder: 30 },
                { sku: 'FM-1002', name: 'Bananas', emoji: '🍌', category: 'Produce', price: 0.99, unit: '/lb', stock: 200, reorder: 50 },
                { sku: 'FM-1003', name: 'Carrots', emoji: '🥕', category: 'Produce', price: 1.49, unit: '/lb', stock: 85, reorder: 25 },
                { sku: 'FM-1004', name: 'Tomatoes', emoji: '🍅', category: 'Produce', price: 1.99, unit: '/lb', stock: 14, reorder: 25 },
                { sku: 'FM-1005', name: 'Potatoes', emoji: '🥔', category: 'Produce', price: 3.99, unit: '/bag', stock: 60, reorder: 20 },
                { sku: 'FM-1006', name: 'Onions', emoji: '🧅', category: 'Produce', price: 2.49, unit: '/bag', stock: 75, reorder: 20 },
                { sku: 'FM-2001', name: 'Milk', emoji: '🥛', category: 'Dairy', price: 3.49, unit: '/gal', stock: 48, reorder: 20 },
                { sku: 'FM-2002', name: 'Eggs', emoji: '🥚', category: 'Dairy', price: 4.99, unit: '/doz', stock: 8, reorder: 15 },
                { sku: 'FM-3001', name: 'Bread', emoji: '🍞', category: 'Bakery', price: 2.99, unit: '', stock: 35, reorder: 15 },
                { sku: 'FM-2003', name: 'Cheese', emoji: '🧀', category: 'Dairy', price: 5.99, unit: '', stock: 26, reorder: 10 },
                { sku: 'FM-4001', name: 'Chicken Breast', emoji: '🍗', category: 'Meat', price: 6.99, unit: '/lb', stock: 42, reorder: 15 },
                { sku: 'FM-4002', name: 'Beef Steak', emoji: '🥩', category: 'Meat', price: 12.99, unit: '/lb', stock: 0, reorder: 10 },
                { sku: 'FM-5001', name: 'Rice', emoji: '🍚', category: 'Pantry', price: 4.99, unit: '/bag', stock: 90, reorder: 25 },
                { sku: 'FM-5002', name: 'Pasta', emoji: '🍝', category: 'Pantry', price: 1.99, unit: '', stock: 110, reorder: 30 },
                { sku: 'FM-6001', name: 'Orange Juice', emoji: '🧃', category: 'Beverages', price: 3.99, unit: '', stock: 55, reorder: 20 },
                { sku: 'FM-6002', name: 'Coffee', emoji: '☕', category: 'Beverages', price: 7.99, unit: '', stock: 33, reorder: 12 },
                { sku: 'FM-6003', name: 'Tea', emoji: '🍵', category: 'Beverages', price: 4.99, unit: '', stock: 44, reorder: 12 },
                { sku: 'FM-2004', name: 'Yogurt', emoji: '🍦', category: 'Dairy', price: 0.99, unit: '', stock: 12, reorder: 20 },
                { sku: 'FM-5003', name: 'Cereal', emoji: '🥣', category: 'Pantry', price: 4.49, unit: '', stock: 67, reorder: 20 },
                { sku: 'FM-1007', name: 'Spinach', emoji: '🥬', category: 'Produce', price: 2.99, unit: '', stock: 29, reorder: 15 }
            ]
        };
    }

    // ===== One-time migration from legacy scattered localStorage keys =====
    function migrateLegacyData(db) {
        let migrated = false;
        const legacyKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;
            if (key.startsWith('user_')) {
                const username = key.slice(5);
                if (!db.users[username]) {
                    try {
                        const u = JSON.parse(localStorage.getItem(key));
                        db.users[username] = { password: u.password, fullName: '', address: '', phone: '', createdAt: new Date().toISOString() };
                        migrated = true;
                    } catch (e) { /* skip corrupt entry */ }
                }
                legacyKeys.push(key);
            } else if (key.startsWith('cart_')) {
                const username = key.slice(5);
                try {
                    db.carts[username] = JSON.parse(localStorage.getItem(key)) || [];
                    migrated = true;
                } catch (e) { /* skip */ }
                legacyKeys.push(key);
            } else if (key.startsWith('orders_')) {
                const username = key.slice(7);
                try {
                    const orders = JSON.parse(localStorage.getItem(key)) || [];
                    orders.forEach(o => {
                        if (!db.orders.find(x => x.id === o.id)) {
                            db.orders.push({ ...o, customer: username, status: o.status || 'Pending' });
                        }
                    });
                    migrated = true;
                } catch (e) { /* skip */ }
                legacyKeys.push(key);
            } else if (key === 'fm_inventory') {
                try {
                    const inv = JSON.parse(localStorage.getItem(key));
                    if (Array.isArray(inv) && inv.length) {
                        // Merge stock levels into the new inventory schema
                        inv.forEach(old => {
                            const item = db.inventory.find(p => p.name === old.name);
                            if (item && typeof old.stock === 'number') item.stock = old.stock;
                        });
                        migrated = true;
                    }
                } catch (e) { /* skip */ }
                legacyKeys.push(key);
            }
        }
        legacyKeys.forEach(k => localStorage.removeItem(k));
        return migrated;
    }

    // ===== Core load/save =====
    let cache = null;

    function load() {
        if (cache) return cache;
        let db;
        try {
            db = JSON.parse(localStorage.getItem(DB_KEY));
        } catch (e) {
            db = null;
        }
        if (!db || !db.meta) {
            db = defaultData();
            migrateLegacyData(db);
            localStorage.setItem(DB_KEY, JSON.stringify(db));
        }
        cache = db;
        return db;
    }

    function save() {
        localStorage.setItem(DB_KEY, JSON.stringify(cache));
    }

    // =========================================================
    //  USERS
    // =========================================================
    function userExists(username) {
        return !!load().users[username];
    }

    function createUser(username, password) {
        const db = load();
        if (db.users[username]) return false;
        db.users[username] = { password, fullName: '', address: '', phone: '', createdAt: new Date().toISOString() };
        save();
        return true;
    }

    function authenticate(username, password) {
        const u = load().users[username];
        if (!u) return { ok: false, reason: 'not_found' };
        if (u.password !== password) return { ok: false, reason: 'bad_password' };
        return { ok: true };
    }

    function getUserProfile(username) {
        const u = load().users[username];
        return u ? { fullName: u.fullName || '', address: u.address || '', phone: u.phone || '' } : null;
    }

    function updateUserProfile(username, profile) {
        const db = load();
        const u = db.users[username];
        if (!u) return false;
        if (profile.fullName !== undefined) u.fullName = profile.fullName;
        if (profile.address !== undefined) u.address = profile.address;
        if (profile.phone !== undefined) u.phone = profile.phone;
        save();
        return true;
    }

    function countUsers() {
        return Object.keys(load().users).length;
    }

    // =========================================================
    //  ADMIN
    // =========================================================
    function authenticateAdmin(username, password) {
        const a = load().settings.admin;
        return username === a.username && password === a.password;
    }

    function getSettings() {
        return { ...load().settings };
    }

    // =========================================================
    //  CARTS
    // =========================================================
    function getCart(username) {
        return (load().carts[username] || []).map(i => ({ ...i }));
    }

    function saveCart(username, cart) {
        const db = load();
        db.carts[username] = cart;
        save();
    }

    // =========================================================
    //  ORDERS
    // =========================================================
    function addOrder(order) {
        const db = load();
        db.orders.push({ status: 'Pending', ...order });
        save();
        return order.id;
    }

    function getAllOrders() {
        return load().orders
            .map(o => ({ ...o }))
            .sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    function getOrdersByUser(username) {
        return getAllOrders().filter(o => o.customer === username);
    }

    function updateOrderStatus(orderId, status) {
        const db = load();
        const order = db.orders.find(o => o.id === orderId);
        if (!order) return false;
        order.status = status;
        save();
        return true;
    }

    // =========================================================
    //  INVENTORY
    // =========================================================
    function getInventory() {
        return load().inventory.map(p => ({ ...p }));
    }

    function setStock(sku, value) {
        const db = load();
        const p = db.inventory.find(x => x.sku === sku);
        if (!p) return false;
        p.stock = Math.max(0, value);
        save();
        return true;
    }

    function restock(sku, qty) {
        const db = load();
        const p = db.inventory.find(x => x.sku === sku);
        if (!p || qty < 1) return false;
        p.stock += qty;
        save();
        return true;
    }

    function deductStock(items) {
        const db = load();
        items.forEach(item => {
            const p = db.inventory.find(x => x.name === item.name);
            if (p) p.stock = Math.max(0, p.stock - (item.qty || 1));
        });
        save();
    }

    // =========================================================
    //  PORTABILITY — export / import / reset
    // =========================================================
    function exportDB() {
        const db = load();
        const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'freshmart-db-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        URL.revokeObjectURL(a.href);
    }

    function importDB(jsonText) {
        let data;
        try {
            data = JSON.parse(jsonText);
        } catch (e) {
            return { ok: false, error: 'Invalid JSON file.' };
        }
        if (!data || !data.meta || data.meta.name !== 'FreshMartDB') {
            return { ok: false, error: 'Not a valid FreshMartDB export file.' };
        }
        cache = data;
        save();
        return { ok: true };
    }

    function resetDB() {
        cache = defaultData();
        save();
    }

    // Initialize on load
    load();

    return {
        // users
        userExists, createUser, authenticate, getUserProfile, updateUserProfile, countUsers,
        // admin
        authenticateAdmin, getSettings,
        // carts
        getCart, saveCart,
        // orders
        addOrder, getAllOrders, getOrdersByUser, updateOrderStatus,
        // inventory
        getInventory, setStock, restock, deductStock,
        // portability
        exportDB, importDB, resetDB
    };
})();