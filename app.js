(() => {
  "use strict";

  const STORAGE_KEY = "santos_pedidos_v1";
  const SESSION_KEY = "santos_pedidos_session_v1";
  const ORDER_STATUSES = [
    "Novo",
    "Confirmado",
    "Em separação",
    "Pronto",
    "Saiu para entrega",
    "Entregue",
    "Fiado",
    "Cancelado"
  ];
  const PAYMENT_METHODS = ["Pix", "Dinheiro", "Débito", "Crédito", "Fiado"];
  const PRODUCT_CATEGORIES = ["Camarão", "Peixe", "Frutos do mar", "Outros"];
  const PRODUCT_UNITS = ["kg", "pacote", "caixa", "unidade"];
  const FINAL_STATUSES = ["Entregue", "Cancelado"];
  const OPEN_DELIVERY_STATUSES = ["Novo", "Confirmado", "Em separação", "Pronto", "Saiu para entrega", "Fiado"];

  let state = null;
  let currentUser = null;
  let currentView = "dashboard";
  let db = null;
  let onlineMode = false;
  let saveTimer = null;
  let savingOrder = false;
  let pendingQuickCustomer = false;

  const $ = id => document.getElementById(id);
  const $$ = selector => Array.from(document.querySelectorAll(selector));

  function defaultState() {
    const now = new Date().toISOString();
    return {
      version: 1,
      settings: {
        businessName: "Santos Alhos",
        businessPhone: "21996313915",
        orderPrefix: "PED",
        nextOrderSequence: 1,
        whatsappTemplate: "Olá, {cliente}! Seu pedido {pedido} foi registrado.\n\n{itens}\n\nTotal: {total}\nEntrega: {entrega}\n\nSantos Alhos"
      },
      users: [
        { id: "u-admin", username: "admin", password: "1234", name: "Administrador", role: "admin" },
        { id: "u-vendedor", username: "vendedor", password: "1234", name: "Vendedor", role: "seller" }
      ],
      customers: [],
      products: [
        { id: uid("prod"), name: "Camarão descascado", category: "Camarão", unit: "kg", price: 45, stock: 0, minStock: 5, active: true, description: "Camarão limpo e pronto para preparo.", createdAt: now },
        { id: uid("prod"), name: "Filé de tilápia 500 g", category: "Peixe", unit: "pacote", price: 30, stock: 0, minStock: 10, active: true, description: "Pacote de filé de tilápia com 500 g.", createdAt: now },
        { id: uid("prod"), name: "Camarão inteiro", category: "Camarão", unit: "kg", price: 32, stock: 0, minStock: 5, active: true, description: "Camarão inteiro selecionado.", createdAt: now }
      ],
      orders: [],
      updatedAt: now
    };
  }

  function uid(prefix = "id") {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function localDateISO(date = new Date()) {
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
  }

  function formatDate(value) {
    if (!value) return "—";
    const [year, month, day] = value.slice(0, 10).split("-");
    return `${day}/${month}/${year}`;
  }

  function formatMoney(value) {
    return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function normalizeText(value = "") {
    return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }

  function onlyDigits(value = "") {
    return String(value).replace(/\D/g, "");
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[char]));
  }

  function slug(value = "") {
    return normalizeText(value).replace(/\s+/g, "-");
  }

  function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function toast(message, type = "success") {
    const el = $("toast");
    el.textContent = message;
    el.className = `toast show ${type}`;
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.className = "toast"; }, 3000);
  }

  function confirmAction(message) {
    return window.confirm(message);
  }

  function validFirebaseConfig(config) {
    return config && config.apiKey && !String(config.apiKey).startsWith("YOUR_") && config.projectId && !String(config.projectId).startsWith("YOUR_");
  }

  async function initStorage() {
    try {
      if (window.firebase && validFirebaseConfig(window.FIREBASE_CONFIG)) {
        if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
        db = firebase.firestore();
        const doc = await db.collection("santosPedidos").doc("main").get();
        if (doc.exists) {
          state = normalizeState(doc.data());
        } else {
          state = loadLocalState();
          await db.collection("santosPedidos").doc("main").set(state);
        }
        onlineMode = true;
      } else {
        state = loadLocalState();
      }
    } catch (error) {
      console.error("Falha ao iniciar Firebase:", error);
      state = loadLocalState();
      onlineMode = false;
      toast("Firebase indisponível. O aplicativo entrou no modo local.", "error");
    }

    updateStorageLabels();
  }

  function loadLocalState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return defaultState();
      return normalizeState(JSON.parse(saved));
    } catch (error) {
      console.error(error);
      return defaultState();
    }
  }

  function normalizeState(data) {
    const base = defaultState();
    return {
      ...base,
      ...data,
      settings: { ...base.settings, ...(data?.settings || {}) },
      users: Array.isArray(data?.users) && data.users.length ? data.users : base.users,
      customers: Array.isArray(data?.customers) ? data.customers : [],
      products: Array.isArray(data?.products) && data.products.length ? data.products : base.products,
      orders: Array.isArray(data?.orders) ? data.orders : []
    };
  }

  function updateStorageLabels() {
    const modeText = onlineMode ? "Banco online Firebase conectado" : "Modo local neste aparelho";
    $("storage-mode").textContent = modeText;
    $("sync-title").textContent = onlineMode ? "Sincronização online ativa" : "Modo local";
    $("sync-description").textContent = onlineMode
      ? "Os dados são armazenados no Firebase e podem ser acessados por outros aparelhos usando o mesmo aplicativo."
      : "Os dados ficam salvos neste navegador. Preencha o arquivo firebase-config.js para sincronizar entre aparelhos.";
  }

  function scheduleSave(immediate = false) {
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    clearTimeout(saveTimer);
    if (!onlineMode) return;
    const save = async () => {
      try {
        await db.collection("santosPedidos").doc("main").set(state);
      } catch (error) {
        console.error("Erro ao sincronizar:", error);
        toast("Dados salvos no aparelho, mas houve falha na sincronização online.", "error");
      }
    };
    if (immediate) save(); else saveTimer = setTimeout(save, 450);
  }

  function populateStaticSelects() {
    fillSelect($("order-status"), ORDER_STATUSES);
    fillSelect($("payment-method"), PAYMENT_METHODS);
    fillSelect($("customer-payment"), PAYMENT_METHODS);
    fillSelect($("product-category"), PRODUCT_CATEGORIES);
    fillSelect($("product-unit"), PRODUCT_UNITS);
    fillSelect($("product-category-filter"), PRODUCT_CATEGORIES, "Todas as categorias");
    fillSelect($("order-status-filter"), ORDER_STATUSES, "Todos os status");
    fillSelect($("delivery-status-filter"), ORDER_STATUSES, "Pendentes e entregues");
  }

  function fillSelect(select, values, placeholder = null) {
    select.innerHTML = placeholder !== null ? `<option value="">${escapeHtml(placeholder)}</option>` : "";
    values.forEach(value => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  }

  function login(username, password) {
    const user = state.users.find(item => item.username === username && item.password === password);
    if (!user) return false;
    currentUser = { id: user.id, username: user.username, name: user.name, role: user.role };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
    enterApp();
    return true;
  }

  function restoreSession() {
    try {
      const session = JSON.parse(sessionStorage.getItem(SESSION_KEY));
      if (!session) return false;
      const user = state.users.find(item => item.id === session.id);
      if (!user) return false;
      currentUser = { id: user.id, username: user.username, name: user.name, role: user.role };
      enterApp();
      return true;
    } catch {
      return false;
    }
  }

  function enterApp() {
    $("login-screen").classList.add("hidden");
    $("app").classList.remove("hidden");
    $("user-name").textContent = currentUser.name;
    $("user-role").textContent = currentUser.role === "admin" ? "Administrador" : "Vendedor";
    $("user-avatar").textContent = currentUser.name.charAt(0).toUpperCase();
    $$(".admin-only").forEach(el => { el.style.display = currentUser.role === "admin" ? "" : "none"; });
    renderAll();
    showView("dashboard");
  }

  function logout() {
    currentUser = null;
    sessionStorage.removeItem(SESSION_KEY);
    $("app").classList.add("hidden");
    $("login-screen").classList.remove("hidden");
    $("login-password").value = "";
  }

  function showView(view) {
    if (view === "reports" || view === "settings") {
      if (currentUser?.role !== "admin") return;
    }
    currentView = view;
    $$(".view").forEach(el => el.classList.remove("active"));
    $$(".nav-btn").forEach(el => el.classList.toggle("active", el.dataset.view === view));
    const target = $(`view-${view}`);
    if (target) target.classList.add("active");
    const titles = {
      dashboard: "Visão geral",
      "new-order": "Novo pedido",
      orders: "Pedidos",
      customers: "Clientes",
      products: "Produtos",
      deliveries: "Entregas",
      reports: "Relatórios",
      settings: "Configurações"
    };
    $("page-title").textContent = titles[view] || "Santos Alhos";
    $("sidebar").classList.remove("open");
    if (view === "new-order" && !$("order-id").value) resetOrderForm();
    if (view === "reports") renderReports();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderAll() {
    renderCustomerOptions();
    renderDashboard();
    renderOrders();
    renderCustomers();
    renderProducts();
    renderDeliveries();
    renderReports();
    renderSettings();
    renderLocationFilters();
  }

  function getCustomer(id) {
    return state.customers.find(item => item.id === id);
  }

  function getProduct(id) {
    return state.products.find(item => item.id === id);
  }

  function orderTotal(order) {
    const subtotal = (order.items || []).reduce((sum, item) => sum + toNumber(item.quantity) * toNumber(item.unitPrice), 0);
    return Math.max(0, subtotal - toNumber(order.discount) + toNumber(order.deliveryFee));
  }

  function orderSubtotal(order) {
    return (order.items || []).reduce((sum, item) => sum + toNumber(item.quantity) * toNumber(item.unitPrice), 0);
  }

  function isToday(date) {
    return date === localDateISO();
  }

  function renderDashboard() {
    const validOrders = state.orders.filter(order => order.status !== "Cancelado");
    const todayOrders = validOrders.filter(order => isToday(order.orderDate));
    const openToday = todayOrders.filter(order => !FINAL_STATUSES.includes(order.status)).length;
    const deliveries = validOrders.filter(order => OPEN_DELIVERY_STATUSES.includes(order.status) && order.deliveryDate).length;
    const credit = validOrders.filter(order => order.paymentMethod === "Fiado" && order.status !== "Entregue").reduce((sum, order) => sum + orderTotal(order), 0);

    $("stat-orders-today").textContent = todayOrders.length;
    $("stat-orders-open").textContent = `${openToday} em andamento`;
    $("stat-sales-today").textContent = formatMoney(todayOrders.reduce((sum, order) => sum + orderTotal(order), 0));
    $("stat-deliveries").textContent = deliveries;
    $("stat-credit").textContent = formatMoney(credit);

    const recent = [...state.orders].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 6);
    $("recent-orders").className = recent.length ? "list-stack" : "list-stack empty-state";
    $("recent-orders").innerHTML = recent.length ? recent.map(order => {
      const customer = getCustomer(order.customerId);
      return `<button class="list-item link-card" data-order-detail="${order.id}">
        <div><strong>${escapeHtml(order.number)}</strong><small>${escapeHtml(customer?.name || "Cliente removido")} · ${formatDate(order.orderDate)}</small></div>
        <div><span class="badge ${slug(order.status)}">${escapeHtml(order.status)}</span><strong>${formatMoney(orderTotal(order))}</strong></div>
      </button>`;
    }).join("") : "Nenhum pedido cadastrado.";

    const regions = {};
    state.orders.filter(order => order.status !== "Cancelado" && order.status !== "Entregue" && order.deliveryDate).forEach(order => {
      const region = order.region || getCustomer(order.customerId)?.region || "Sem região";
      regions[region] = (regions[region] || 0) + 1;
    });
    const regionEntries = Object.entries(regions).sort((a, b) => b[1] - a[1]);
    $("region-summary").className = regionEntries.length ? "list-stack" : "list-stack empty-state";
    $("region-summary").innerHTML = regionEntries.length ? regionEntries.map(([region, count]) => `<div class="list-item"><div><strong>${escapeHtml(region)}</strong><small>Região de entrega</small></div><strong>${count} pedido${count > 1 ? "s" : ""}</strong></div>`).join("") : "Nenhuma entrega pendente.";
  }

  function renderCustomerOptions(selectedId = null) {
    const select = $("order-customer");
    const current = selectedId || select.value;
    select.innerHTML = '<option value="">Selecione o cliente</option>';
    [...state.customers].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")).forEach(customer => {
      const option = document.createElement("option");
      option.value = customer.id;
      option.textContent = `${customer.name} — ${customer.region || customer.city || customer.phone}`;
      select.appendChild(option);
    });
    if (current && state.customers.some(c => c.id === current)) select.value = current;
  }

  function nextOrderNumber() {
    const prefix = (state.settings.orderPrefix || "PED").trim().toUpperCase();
    const sequence = String(Number(state.settings.nextOrderSequence || 1)).padStart(6, "0");
    return `${prefix}-${sequence}`;
  }

  function resetOrderForm() {
    $("order-form").reset();
    $("order-id").value = "";
    $("order-form-title").textContent = "Novo pedido";
    $("next-order-number").textContent = `Próximo: ${nextOrderNumber()}`;
    $("order-date").value = localDateISO();
    $("delivery-date").value = localDateISO();
    $("order-status").value = "Novo";
    $("payment-method").value = "Pix";
    $("order-discount").value = "0";
    $("delivery-fee").value = "0";
    $("order-items").innerHTML = "";
    addOrderItem();
    calculateOrderForm();
    $("save-order-btn").disabled = false;
    $("save-order-btn").textContent = "Salvar pedido";
  }

  function addOrderItem(item = null) {
    const row = document.createElement("div");
    row.className = "order-item-row";
    row.innerHTML = `
      <label>Produto<select class="item-product" required><option value="">Selecione</option></select></label>
      <label>Quantidade<input class="item-quantity" type="number" min="0.001" step="0.001" value="${item ? escapeHtml(item.quantity) : "1"}" required /></label>
      <label>Preço unitário<input class="item-price" type="number" min="0" step="0.01" value="${item ? escapeHtml(item.unitPrice) : "0"}" required /></label>
      <label>Total<div class="order-item-total">R$ 0,00</div></label>
      <button type="button" class="icon-btn outlined remove-item" title="Remover item">🗑</button>`;
    const productSelect = row.querySelector(".item-product");
    state.products.filter(product => product.active || product.id === item?.productId).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")).forEach(product => {
      const option = document.createElement("option");
      option.value = product.id;
      option.textContent = `${product.name} — ${formatMoney(product.price)}/${product.unit}`;
      productSelect.appendChild(option);
    });
    if (item) productSelect.value = item.productId;
    $("order-items").appendChild(row);
    calculateOrderForm();
  }

  function calculateOrderForm() {
    let subtotal = 0;
    $$(".order-item-row").forEach(row => {
      const quantity = toNumber(row.querySelector(".item-quantity").value);
      const price = toNumber(row.querySelector(".item-price").value);
      const total = quantity * price;
      row.querySelector(".order-item-total").textContent = formatMoney(total);
      subtotal += total;
    });
    const discount = toNumber($("order-discount").value);
    const deliveryFee = toNumber($("delivery-fee").value);
    const total = Math.max(0, subtotal - discount + deliveryFee);
    $("order-subtotal").textContent = formatMoney(subtotal);
    $("order-discount-preview").textContent = formatMoney(discount);
    $("delivery-fee-preview").textContent = formatMoney(deliveryFee);
    $("order-total").textContent = formatMoney(total);
  }

  function getOrderFormItems() {
    return $$(".order-item-row").map(row => {
      const productId = row.querySelector(".item-product").value;
      const product = getProduct(productId);
      return {
        productId,
        productName: product?.name || "Produto",
        unit: product?.unit || "unidade",
        quantity: toNumber(row.querySelector(".item-quantity").value),
        unitPrice: toNumber(row.querySelector(".item-price").value)
      };
    }).filter(item => item.productId && item.quantity > 0);
  }

  function saveOrderFromForm(event) {
    event.preventDefault();
    if (savingOrder) return;
    const items = getOrderFormItems();
    if (!items.length) {
      toast("Adicione pelo menos um produto ao pedido.", "error");
      return;
    }
    const customerId = $("order-customer").value;
    if (!customerId) {
      toast("Selecione um cliente.", "error");
      return;
    }

    savingOrder = true;
    $("save-order-btn").disabled = true;
    $("save-order-btn").textContent = "Salvando…";

    const existingId = $("order-id").value;
    const existing = state.orders.find(order => order.id === existingId);
    const order = {
      id: existing?.id || uid("order"),
      number: existing?.number || nextOrderNumber(),
      customerId,
      orderDate: $("order-date").value,
      deliveryDate: $("delivery-date").value,
      deliveryTime: $("delivery-time").value,
      status: $("order-status").value,
      paymentMethod: $("payment-method").value,
      discount: toNumber($("order-discount").value),
      deliveryFee: toNumber($("delivery-fee").value),
      address: $("order-address").value.trim(),
      region: $("order-region").value.trim(),
      notes: $("order-notes").value.trim(),
      items,
      stockDeducted: existing?.stockDeducted || false,
      createdAt: existing?.createdAt || new Date().toISOString(),
      createdBy: existing?.createdBy || currentUser.name,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser.name
    };

    if (existing) {
      state.orders = state.orders.map(item => item.id === order.id ? order : item);
    } else {
      state.orders.push(order);
      state.settings.nextOrderSequence = Number(state.settings.nextOrderSequence || 1) + 1;
    }

    if (order.status === "Entregue" && !order.stockDeducted) deductOrderStock(order);
    scheduleSave(true);
    renderAll();
    toast(existing ? "Pedido atualizado com sucesso." : `${order.number} salvo com sucesso.`);
    resetOrderForm();
    showView("orders");
    setTimeout(() => { savingOrder = false; }, 500);
  }

  function deductOrderStock(order) {
    order.items.forEach(item => {
      const product = getProduct(item.productId);
      if (product) product.stock = Math.max(0, toNumber(product.stock) - toNumber(item.quantity));
    });
    order.stockDeducted = true;
  }

  function editOrder(id) {
    const order = state.orders.find(item => item.id === id);
    if (!order) return;
    renderCustomerOptions(order.customerId);
    $("order-id").value = order.id;
    $("order-form-title").textContent = `Editar ${order.number}`;
    $("next-order-number").textContent = `Criado por ${order.createdBy || "—"}`;
    $("order-customer").value = order.customerId;
    $("order-date").value = order.orderDate;
    $("delivery-date").value = order.deliveryDate || "";
    $("delivery-time").value = order.deliveryTime || "";
    $("order-status").value = order.status;
    $("payment-method").value = order.paymentMethod;
    $("order-discount").value = order.discount || 0;
    $("delivery-fee").value = order.deliveryFee || 0;
    $("order-address").value = order.address || "";
    $("order-region").value = order.region || "";
    $("order-notes").value = order.notes || "";
    $("order-items").innerHTML = "";
    order.items.forEach(item => addOrderItem(item));
    calculateOrderForm();
    closeModal("order-detail-modal");
    showView("new-order");
  }

  function setOrderStatus(id, status) {
    const order = state.orders.find(item => item.id === id);
    if (!order) return;
    order.status = status;
    order.updatedAt = new Date().toISOString();
    order.updatedBy = currentUser.name;
    if (status === "Entregue" && !order.stockDeducted) deductOrderStock(order);
    scheduleSave(true);
    renderAll();
    closeModal("order-detail-modal");
    toast(`Pedido ${order.number}: ${status}.`);
  }

  function cancelOrDeleteOrder(id) {
    const order = state.orders.find(item => item.id === id);
    if (!order || currentUser.role !== "admin") return;
    if (order.status !== "Cancelado") {
      if (!confirmAction(`Cancelar o pedido ${order.number}?`)) return;
      setOrderStatus(id, "Cancelado");
    } else {
      if (!confirmAction(`Excluir definitivamente o pedido ${order.number}?`)) return;
      state.orders = state.orders.filter(item => item.id !== id);
      scheduleSave(true);
      renderAll();
      closeModal("order-detail-modal");
      toast("Pedido excluído.");
    }
  }

  function filteredOrders() {
    const search = normalizeText($("order-search").value);
    const status = $("order-status-filter").value;
    const date = $("order-date-filter").value;
    return [...state.orders].filter(order => {
      const customer = getCustomer(order.customerId);
      const haystack = normalizeText([order.number, customer?.name, customer?.phone, order.region, order.address].join(" "));
      return (!search || haystack.includes(search)) && (!status || order.status === status) && (!date || order.orderDate === date);
    }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  function renderOrders() {
    const orders = filteredOrders();
    const body = $("orders-table");
    body.innerHTML = orders.length ? orders.map(order => {
      const customer = getCustomer(order.customerId);
      return `<tr>
        <td><strong>${escapeHtml(order.number)}</strong></td>
        <td>${escapeHtml(customer?.name || "Cliente removido")}</td>
        <td>${formatDate(order.orderDate)}</td>
        <td>${formatDate(order.deliveryDate)} ${escapeHtml(order.deliveryTime || "")}</td>
        <td><span class="badge ${slug(order.status)}">${escapeHtml(order.status)}</span></td>
        <td><strong>${formatMoney(orderTotal(order))}</strong></td>
        <td><div class="actions-row"><button class="action-mini" data-order-detail="${order.id}">Abrir</button><button class="action-mini" data-order-edit="${order.id}">Editar</button></div></td>
      </tr>`;
    }).join("") : '<tr><td colspan="7" class="empty-state">Nenhum pedido encontrado.</td></tr>';

    $("orders-mobile").innerHTML = orders.length ? orders.map(order => {
      const customer = getCustomer(order.customerId);
      return `<article class="order-mobile-card">
        <div class="order-mobile-head"><div><strong>${escapeHtml(order.number)}</strong><div>${escapeHtml(customer?.name || "Cliente removido")}</div></div><span class="badge ${slug(order.status)}">${escapeHtml(order.status)}</span></div>
        <div class="order-mobile-meta"><span>Pedido: ${formatDate(order.orderDate)}</span><span>Entrega: ${formatDate(order.deliveryDate)}</span><span>${escapeHtml(order.paymentMethod)}</span><strong>${formatMoney(orderTotal(order))}</strong></div>
        <div class="actions-row"><button class="action-mini" data-order-detail="${order.id}">Abrir</button><button class="action-mini" data-order-edit="${order.id}">Editar</button></div>
      </article>`;
    }).join("") : '<div class="empty-state">Nenhum pedido encontrado.</div>';
  }

  function openOrderDetail(id) {
    const order = state.orders.find(item => item.id === id);
    if (!order) return;
    const customer = getCustomer(order.customerId);
    $("detail-order-number").textContent = order.number;
    $("detail-order-customer").textContent = customer?.name || "Cliente removido";
    $("order-detail-content").innerHTML = `
      <div class="detail-grid">
        <div class="detail-box"><span>Status</span><strong><span class="badge ${slug(order.status)}">${escapeHtml(order.status)}</span></strong></div>
        <div class="detail-box"><span>Pedido</span><strong>${formatDate(order.orderDate)}</strong></div>
        <div class="detail-box"><span>Entrega</span><strong>${formatDate(order.deliveryDate)} ${escapeHtml(order.deliveryTime || "")}</strong></div>
        <div class="detail-box"><span>Pagamento</span><strong>${escapeHtml(order.paymentMethod)}</strong></div>
        <div class="detail-box"><span>WhatsApp</span><strong>${escapeHtml(customer?.phone || "—")}</strong></div>
        <div class="detail-box"><span>Região</span><strong>${escapeHtml(order.region || customer?.region || "—")}</strong></div>
      </div>
      <div class="detail-box"><span>Endereço</span><strong>${escapeHtml(order.address || customer?.address || "—")}</strong></div>
      <table class="detail-items"><thead><tr><th>Produto</th><th>Qtd.</th><th>Preço</th><th>Total</th></tr></thead><tbody>
        ${order.items.map(item => `<tr><td>${escapeHtml(item.productName)}</td><td>${escapeHtml(item.quantity)} ${escapeHtml(item.unit)}</td><td>${formatMoney(item.unitPrice)}</td><td>${formatMoney(item.quantity * item.unitPrice)}</td></tr>`).join("")}
      </tbody></table>
      ${order.discount ? `<p>Desconto: <strong>${formatMoney(order.discount)}</strong></p>` : ""}
      ${order.deliveryFee ? `<p>Taxa de entrega: <strong>${formatMoney(order.deliveryFee)}</strong></p>` : ""}
      ${order.notes ? `<div class="detail-box"><span>Observações</span><strong>${escapeHtml(order.notes)}</strong></div>` : ""}
      <div class="detail-total"><span>Total</span><span>${formatMoney(orderTotal(order))}</span></div>`;

    const actions = [
      `<button class="btn secondary" data-order-whatsapp="${order.id}">WhatsApp</button>`,
      `<button class="btn ghost" data-order-map="${order.id}">Abrir mapa</button>`,
      `<button class="btn ghost" data-order-edit="${order.id}">Editar</button>`
    ];
    if (order.status !== "Entregue" && order.status !== "Cancelado") actions.push(`<button class="btn primary" data-order-delivered="${order.id}">Marcar entregue</button>`);
    if (currentUser.role === "admin") actions.push(`<button class="btn danger" data-order-delete="${order.id}">${order.status === "Cancelado" ? "Excluir" : "Cancelar"}</button>`);
    $("order-detail-actions").innerHTML = actions.join("");
    openModal("order-detail-modal");
  }

  function openWhatsApp(orderId) {
    const order = state.orders.find(item => item.id === orderId);
    if (!order) return;
    const customer = getCustomer(order.customerId);
    const phone = onlyDigits(customer?.phone);
    if (!phone) {
      toast("O cliente não possui WhatsApp cadastrado.", "error");
      return;
    }
    const items = order.items.map(item => `${item.quantity} ${item.unit} de ${item.productName} — ${formatMoney(item.quantity * item.unitPrice)}`).join("\n");
    const delivery = order.deliveryDate ? `${formatDate(order.deliveryDate)}${order.deliveryTime ? ` às ${order.deliveryTime}` : ""}` : "a combinar";
    let message = state.settings.whatsappTemplate || "Olá, {cliente}! Seu pedido {pedido} foi registrado.";
    message = message
      .replaceAll("{cliente}", customer?.name || "cliente")
      .replaceAll("{pedido}", order.number)
      .replaceAll("{itens}", items)
      .replaceAll("{total}", formatMoney(orderTotal(order)))
      .replaceAll("{entrega}", delivery);
    window.open(`https://wa.me/55${phone.replace(/^55/, "")}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
  }

  function openMap(orderId) {
    const order = state.orders.find(item => item.id === orderId);
    if (!order) return;
    const customer = getCustomer(order.customerId);
    const address = [order.address || customer?.address, order.region || customer?.region, customer?.city].filter(Boolean).join(", ");
    if (!address) {
      toast("Endereço não informado.", "error");
      return;
    }
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, "_blank", "noopener");
  }

  function openCustomerModal(customer = null) {
    $("customer-form").reset();
    $("customer-id").value = customer?.id || "";
    $("customer-modal-title").textContent = customer ? "Editar cliente" : "Novo cliente";
    $("customer-name").value = customer?.name || "";
    $("customer-phone").value = customer?.phone || "";
    $("customer-document").value = customer?.document || "";
    $("customer-zip").value = customer?.zip || "";
    $("customer-address").value = customer?.address || "";
    $("customer-region").value = customer?.region || "";
    $("customer-city").value = customer?.city || "";
    $("customer-reference").value = customer?.reference || "";
    $("customer-payment").value = customer?.preferredPayment || "Pix";
    $("customer-notes").value = customer?.notes || "";
    openModal("customer-modal");
  }

  function saveCustomer(event) {
    event.preventDefault();
    const id = $("customer-id").value;
    const existing = state.customers.find(item => item.id === id);
    const customer = {
      id: existing?.id || uid("customer"),
      name: $("customer-name").value.trim(),
      phone: $("customer-phone").value.trim(),
      document: $("customer-document").value.trim(),
      zip: $("customer-zip").value.trim(),
      address: $("customer-address").value.trim(),
      region: $("customer-region").value.trim(),
      city: $("customer-city").value.trim(),
      reference: $("customer-reference").value.trim(),
      preferredPayment: $("customer-payment").value,
      notes: $("customer-notes").value.trim(),
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (existing) state.customers = state.customers.map(item => item.id === id ? customer : item);
    else state.customers.push(customer);
    scheduleSave(true);
    renderAll();
    closeModal("customer-modal");
    toast(existing ? "Cliente atualizado." : "Cliente cadastrado.");
    if (pendingQuickCustomer) {
      pendingQuickCustomer = false;
      renderCustomerOptions(customer.id);
      applyCustomerToOrder(customer.id);
      showView("new-order");
    }
  }

  function deleteCustomer(id) {
    if (currentUser.role !== "admin") return;
    if (state.orders.some(order => order.customerId === id)) {
      toast("Este cliente possui pedidos e não pode ser excluído.", "error");
      return;
    }
    if (!confirmAction("Excluir este cliente?")) return;
    state.customers = state.customers.filter(item => item.id !== id);
    scheduleSave(true);
    renderAll();
    toast("Cliente excluído.");
  }

  function renderCustomers() {
    const search = normalizeText($("customer-search").value);
    const city = $("customer-city-filter").value;
    const region = $("customer-region-filter").value;
    const customers = [...state.customers].filter(customer => {
      const haystack = normalizeText([customer.name, customer.phone, customer.address, customer.region, customer.city, customer.reference].join(" "));
      return (!search || haystack.includes(search)) && (!city || customer.city === city) && (!region || customer.region === region);
    }).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    $("customers-grid").innerHTML = customers.length ? customers.map(customer => {
      const orders = state.orders.filter(order => order.customerId === customer.id && order.status !== "Cancelado");
      const total = orders.reduce((sum, order) => sum + orderTotal(order), 0);
      return `<article class="info-card">
        <div class="info-card-head"><div><h4>${escapeHtml(customer.name)}</h4><span class="badge">${escapeHtml(customer.region || "Sem bairro")}</span></div><strong>${orders.length} pedido${orders.length !== 1 ? "s" : ""}</strong></div>
        <div class="meta"><span>📱 ${escapeHtml(customer.phone)}</span><span>📍 ${escapeHtml([customer.address, customer.city].filter(Boolean).join(" — "))}</span><span>Compras: <strong>${formatMoney(total)}</strong></span></div>
        <div class="card-actions">
          <button class="action-mini" data-customer-order="${customer.id}">Novo pedido</button>
          <button class="action-mini" data-customer-map="${customer.id}">Mapa</button>
          <button class="action-mini" data-customer-edit="${customer.id}">Editar</button>
          ${currentUser?.role === "admin" ? `<button class="action-mini" data-customer-delete="${customer.id}">Excluir</button>` : ""}
        </div>
      </article>`;
    }).join("") : '<div class="empty-state">Nenhum cliente encontrado. Cadastre o primeiro cliente.</div>';
  }

  function applyCustomerToOrder(customerId) {
    const customer = getCustomer(customerId);
    if (!customer) return;
    $("order-customer").value = customer.id;
    $("order-address").value = customer.address || "";
    $("order-region").value = customer.region || "";
    $("payment-method").value = customer.preferredPayment || "Pix";
  }

  function newOrderForCustomer(id) {
    resetOrderForm();
    renderCustomerOptions(id);
    applyCustomerToOrder(id);
    showView("new-order");
  }

  function customerMap(id) {
    const customer = getCustomer(id);
    if (!customer) return;
    const address = [customer.address, customer.region, customer.city].filter(Boolean).join(", ");
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, "_blank", "noopener");
  }

  function openProductModal(product = null) {
    if (currentUser.role !== "admin") return;
    $("product-form").reset();
    $("product-id").value = product?.id || "";
    $("product-modal-title").textContent = product ? "Editar produto" : "Novo produto";
    $("product-name").value = product?.name || "";
    $("product-category").value = product?.category || "Camarão";
    $("product-unit").value = product?.unit || "kg";
    $("product-price").value = product?.price ?? "";
    $("product-stock").value = product?.stock ?? 0;
    $("product-min-stock").value = product?.minStock ?? 0;
    $("product-active").value = String(product?.active ?? true);
    $("product-description").value = product?.description || "";
    openModal("product-modal");
  }

  function saveProduct(event) {
    event.preventDefault();
    if (currentUser.role !== "admin") return;
    const id = $("product-id").value;
    const existing = state.products.find(item => item.id === id);
    const product = {
      id: existing?.id || uid("product"),
      name: $("product-name").value.trim(),
      category: $("product-category").value,
      unit: $("product-unit").value,
      price: toNumber($("product-price").value),
      stock: toNumber($("product-stock").value),
      minStock: toNumber($("product-min-stock").value),
      active: $("product-active").value === "true",
      description: $("product-description").value.trim(),
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (existing) state.products = state.products.map(item => item.id === id ? product : item);
    else state.products.push(product);
    scheduleSave(true);
    renderAll();
    closeModal("product-modal");
    toast(existing ? "Produto atualizado." : "Produto cadastrado.");
  }

  function deleteProduct(id) {
    if (currentUser.role !== "admin") return;
    if (state.orders.some(order => order.items.some(item => item.productId === id))) {
      toast("Este produto já possui pedidos. Marque-o como indisponível em vez de excluir.", "error");
      return;
    }
    if (!confirmAction("Excluir este produto?")) return;
    state.products = state.products.filter(item => item.id !== id);
    scheduleSave(true);
    renderAll();
    toast("Produto excluído.");
  }

  function renderProducts() {
    const search = normalizeText($("product-search").value);
    const category = $("product-category-filter").value;
    const products = [...state.products].filter(product => (!search || normalizeText([product.name, product.description].join(" ")).includes(search)) && (!category || product.category === category)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    const icons = { "Camarão": "🦐", "Peixe": "🐟", "Frutos do mar": "🦞", "Outros": "📦" };
    $("products-grid").innerHTML = products.length ? products.map(product => {
      const low = toNumber(product.stock) <= toNumber(product.minStock) && toNumber(product.minStock) > 0;
      return `<article class="info-card">
        <div class="info-card-head"><div class="product-icon">${icons[product.category] || "📦"}</div><span class="badge ${product.active ? "pago" : "cancelado"}">${product.active ? "Disponível" : "Indisponível"}</span></div>
        <h4>${escapeHtml(product.name)}</h4><p>${escapeHtml(product.description || product.category)}</p>
        <div class="meta"><span>Preço: <strong>${formatMoney(product.price)}/${escapeHtml(product.unit)}</strong></span><span class="${low ? "stock-low" : ""}">Estoque: ${escapeHtml(product.stock)} ${escapeHtml(product.unit)}${low ? " — estoque baixo" : ""}</span></div>
        ${currentUser?.role === "admin" ? `<div class="card-actions"><button class="action-mini" data-product-edit="${product.id}">Editar</button><button class="action-mini" data-product-delete="${product.id}">Excluir</button></div>` : ""}
      </article>`;
    }).join("") : '<div class="empty-state">Nenhum produto encontrado.</div>';
  }

  function renderLocationFilters() {
    const cities = [...new Set(state.customers.map(c => c.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const regions = [...new Set([...state.customers.map(c => c.region), ...state.orders.map(o => o.region)].filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    preserveAndFill($("customer-city-filter"), cities, "Todas as cidades");
    preserveAndFill($("customer-region-filter"), regions, "Todos os bairros");
    preserveAndFill($("delivery-region-filter"), regions, "Todas as regiões");
  }

  function preserveAndFill(select, values, placeholder) {
    const current = select.value;
    fillSelect(select, values, placeholder);
    if (values.includes(current)) select.value = current;
  }

  function filteredDeliveries() {
    const date = $("delivery-date-filter").value;
    const region = $("delivery-region-filter").value;
    const status = $("delivery-status-filter").value;
    return state.orders.filter(order => {
      const actualRegion = order.region || getCustomer(order.customerId)?.region || "Sem região";
      return order.status !== "Cancelado" && order.deliveryDate && (!date || order.deliveryDate === date) && (!region || actualRegion === region) && (!status || order.status === status);
    }).sort((a, b) => `${a.deliveryDate}${a.deliveryTime || ""}`.localeCompare(`${b.deliveryDate}${b.deliveryTime || ""}`));
  }

  function renderDeliveries() {
    const orders = filteredDeliveries();
    const groups = {};
    orders.forEach(order => {
      const region = order.region || getCustomer(order.customerId)?.region || "Sem região";
      if (!groups[region]) groups[region] = [];
      groups[region].push(order);
    });
    const html = Object.keys(groups).sort((a, b) => a.localeCompare(b, "pt-BR")).map(region => `<section class="delivery-group"><h4>${escapeHtml(region)} — ${groups[region].length} entrega${groups[region].length > 1 ? "s" : ""}</h4>${groups[region].map(order => {
      const customer = getCustomer(order.customerId);
      return `<article class="delivery-card">
        <div><strong>${escapeHtml(order.number)} · ${escapeHtml(customer?.name || "Cliente removido")}</strong><small>${escapeHtml(order.address || customer?.address || "Endereço não informado")}</small></div>
        <div><small>Data e horário</small><strong>${formatDate(order.deliveryDate)} ${escapeHtml(order.deliveryTime || "")}</strong></div>
        <div><small>Receber</small><strong>${formatMoney(orderTotal(order))}</strong></div>
        <div><span class="badge ${slug(order.status)}">${escapeHtml(order.status)}</span></div>
        <div class="delivery-actions"><button class="action-mini" data-order-map="${order.id}">Mapa</button><button class="action-mini" data-order-whatsapp="${order.id}">WhatsApp</button>${order.status !== "Entregue" ? `<button class="action-mini" data-order-delivered="${order.id}">Entregue</button>` : ""}</div>
      </article>`;
    }).join("")}</section>`).join("");
    $("deliveries-list").innerHTML = html || '<div class="empty-state">Nenhuma entrega encontrada.</div>';
  }

  function renderReports() {
    if (!state || !$('report-start')) return;
    const start = $("report-start").value || "0000-00-00";
    const end = $("report-end").value || "9999-99-99";
    const orders = state.orders.filter(order => order.status !== "Cancelado" && order.orderDate >= start && order.orderDate <= end);
    const sales = orders.reduce((sum, order) => sum + orderTotal(order), 0);
    const credit = orders.filter(order => order.paymentMethod === "Fiado" && order.status !== "Entregue").reduce((sum, order) => sum + orderTotal(order), 0);
    $("report-sales").textContent = formatMoney(sales);
    $("report-orders").textContent = orders.length;
    $("report-ticket").textContent = formatMoney(orders.length ? sales / orders.length : 0);
    $("report-credit").textContent = formatMoney(credit);

    const productStats = {};
    const customerStats = {};
    const regionStats = {};
    const paymentStats = {};
    orders.forEach(order => {
      order.items.forEach(item => {
        if (!productStats[item.productName]) productStats[item.productName] = { quantity: 0, unit: item.unit, value: 0 };
        productStats[item.productName].quantity += toNumber(item.quantity);
        productStats[item.productName].value += toNumber(item.quantity) * toNumber(item.unitPrice);
      });
      const customer = getCustomer(order.customerId);
      const customerName = customer?.name || "Cliente removido";
      customerStats[customerName] = (customerStats[customerName] || 0) + orderTotal(order);
      const region = order.region || customer?.region || customer?.city || "Sem região";
      regionStats[region] = (regionStats[region] || 0) + orderTotal(order);
      paymentStats[order.paymentMethod] = (paymentStats[order.paymentMethod] || 0) + orderTotal(order);
    });

    renderRanking("top-products", Object.entries(productStats).sort((a, b) => b[1].quantity - a[1].quantity).slice(0, 8).map(([name, data]) => ({ name, value: `${data.quantity.toLocaleString("pt-BR")} ${data.unit}` })));
    renderRanking("top-customers", Object.entries(customerStats).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value: formatMoney(value) })));
    renderRanking("sales-by-region", Object.entries(regionStats).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value: formatMoney(value) })));
    renderRanking("sales-by-payment", Object.entries(paymentStats).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value: formatMoney(value) })));
  }

  function renderRanking(id, items) {
    $(id).innerHTML = items.length ? items.map((item, index) => `<div class="ranking-item"><span class="ranking-number">${index + 1}</span><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.value)}</span></div>`).join("") : '<div class="empty-state">Sem dados no período.</div>';
  }

  function renderSettings() {
    if (!state) return;
    $("business-name").value = state.settings.businessName || "";
    $("business-phone").value = state.settings.businessPhone || "";
    $("order-prefix").value = state.settings.orderPrefix || "PED";
    $("next-order-sequence").value = state.settings.nextOrderSequence || 1;
    $("whatsapp-template").value = state.settings.whatsappTemplate || "";
  }

  function saveSettings(event) {
    event.preventDefault();
    state.settings.businessName = $("business-name").value.trim() || "Santos Alhos";
    state.settings.businessPhone = onlyDigits($("business-phone").value);
    state.settings.orderPrefix = $("order-prefix").value.trim().toUpperCase() || "PED";
    state.settings.nextOrderSequence = Math.max(1, Number($("next-order-sequence").value || 1));
    state.settings.whatsappTemplate = $("whatsapp-template").value;
    scheduleSave(true);
    resetOrderForm();
    toast("Configurações salvas.");
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `backup-santos-pedidos-${localDateISO()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = event => {
      try {
        const imported = normalizeState(JSON.parse(event.target.result));
        if (!confirmAction("Substituir os dados atuais pelo backup selecionado?")) return;
        state = imported;
        scheduleSave(true);
        renderAll();
        toast("Backup importado com sucesso.");
      } catch (error) {
        console.error(error);
        toast("Arquivo de backup inválido.", "error");
      }
    };
    reader.readAsText(file);
  }

  function openModal(id) {
    const modal = $(id);
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal(id) {
    const modal = $(id);
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function bindEvents() {
    $("login-form").addEventListener("submit", event => {
      event.preventDefault();
      if (!login($("login-user").value.trim(), $("login-password").value)) toast("Usuário ou senha inválidos.", "error");
    });
    $("logout-btn").addEventListener("click", logout);
    $("menu-btn").addEventListener("click", () => $("sidebar").classList.toggle("open"));
    $$(".nav-btn").forEach(btn => btn.addEventListener("click", () => showView(btn.dataset.view)));
    $$('[data-open-view]').forEach(btn => btn.addEventListener("click", () => showView(btn.dataset.openView)));
    $$('[data-close-modal]').forEach(btn => btn.addEventListener("click", () => closeModal(btn.dataset.closeModal)));
    $$(".modal").forEach(modal => modal.addEventListener("click", event => { if (event.target === modal) closeModal(modal.id); }));

    $("add-item-btn").addEventListener("click", () => addOrderItem());
    $("order-items").addEventListener("input", calculateOrderForm);
    $("order-items").addEventListener("change", event => {
      const row = event.target.closest(".order-item-row");
      if (event.target.classList.contains("item-product") && row) {
        const product = getProduct(event.target.value);
        if (product) row.querySelector(".item-price").value = product.price;
      }
      calculateOrderForm();
    });
    $("order-items").addEventListener("click", event => {
      const remove = event.target.closest(".remove-item");
      if (!remove) return;
      if ($$(".order-item-row").length === 1) {
        toast("O pedido precisa ter pelo menos um item.", "error");
        return;
      }
      remove.closest(".order-item-row").remove();
      calculateOrderForm();
    });
    $("order-discount").addEventListener("input", calculateOrderForm);
    $("delivery-fee").addEventListener("input", calculateOrderForm);
    $("order-customer").addEventListener("change", event => applyCustomerToOrder(event.target.value));
    $("order-form").addEventListener("submit", saveOrderFromForm);
    $("clear-order-btn").addEventListener("click", resetOrderForm);
    $("quick-customer-btn").addEventListener("click", () => { pendingQuickCustomer = true; openCustomerModal(); });

    $("add-customer-btn").addEventListener("click", () => openCustomerModal());
    $("customer-form").addEventListener("submit", saveCustomer);
    $("add-product-btn").addEventListener("click", () => openProductModal());
    $("product-form").addEventListener("submit", saveProduct);
    $("settings-form").addEventListener("submit", saveSettings);
    $("export-data-btn").addEventListener("click", exportData);
    $("import-data-input").addEventListener("change", event => { if (event.target.files[0]) importData(event.target.files[0]); event.target.value = ""; });

    ["order-search", "order-status-filter", "order-date-filter"].forEach(id => $(id).addEventListener(id === "order-search" ? "input" : "change", renderOrders));
    $("clear-order-filters").addEventListener("click", () => { $("order-search").value = ""; $("order-status-filter").value = ""; $("order-date-filter").value = ""; renderOrders(); });
    ["customer-search", "customer-city-filter", "customer-region-filter"].forEach(id => $(id).addEventListener(id === "customer-search" ? "input" : "change", renderCustomers));
    ["product-search", "product-category-filter"].forEach(id => $(id).addEventListener(id === "product-search" ? "input" : "change", renderProducts));
    ["delivery-date-filter", "delivery-region-filter", "delivery-status-filter"].forEach(id => $(id).addEventListener("change", renderDeliveries));
    $("apply-report-filter").addEventListener("click", renderReports);

    document.addEventListener("click", event => {
      const target = event.target.closest("[data-order-detail],[data-order-edit],[data-order-whatsapp],[data-order-map],[data-order-delivered],[data-order-delete],[data-customer-edit],[data-customer-delete],[data-customer-order],[data-customer-map],[data-product-edit],[data-product-delete]");
      if (!target) return;
      if (target.dataset.orderDetail) openOrderDetail(target.dataset.orderDetail);
      else if (target.dataset.orderEdit) editOrder(target.dataset.orderEdit);
      else if (target.dataset.orderWhatsapp) openWhatsApp(target.dataset.orderWhatsapp);
      else if (target.dataset.orderMap) openMap(target.dataset.orderMap);
      else if (target.dataset.orderDelivered) setOrderStatus(target.dataset.orderDelivered, "Entregue");
      else if (target.dataset.orderDelete) cancelOrDeleteOrder(target.dataset.orderDelete);
      else if (target.dataset.customerEdit) openCustomerModal(getCustomer(target.dataset.customerEdit));
      else if (target.dataset.customerDelete) deleteCustomer(target.dataset.customerDelete);
      else if (target.dataset.customerOrder) newOrderForCustomer(target.dataset.customerOrder);
      else if (target.dataset.customerMap) customerMap(target.dataset.customerMap);
      else if (target.dataset.productEdit) openProductModal(getProduct(target.dataset.productEdit));
      else if (target.dataset.productDelete) deleteProduct(target.dataset.productDelete);
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") $$(".modal.open").forEach(modal => closeModal(modal.id));
    });
  }

  async function init() {
    populateStaticSelects();
    bindEvents();
    const today = new Date();
    $("today-label").textContent = today.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    $("delivery-date-filter").value = localDateISO();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    $("report-start").value = localDateISO(firstDay);
    $("report-end").value = localDateISO(today);
    await initStorage();
    renderAll();
    resetOrderForm();
    restoreSession();

    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("service-worker.js").catch(error => console.warn("Service worker:", error));
    }
  }

  init();
})();
