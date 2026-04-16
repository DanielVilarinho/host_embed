let APP_CONFIG = null;

const state = {
  sessionUser: null,
  selectedCompany: null,
  selectedDashboardId: null,
};

const embedController = {
  mountedDashboardId: null,
  setter: null,
};

async function loadConfig() {
  const resp = await fetch("./config.json");
  APP_CONFIG = await resp.json();
  console.log("APP_CONFIG carregado =", APP_CONFIG);
}

function saveSession() {
  sessionStorage.setItem("intellibrand_host_session", JSON.stringify(state));
  console.log("Sessão salva =", state);
}

function loadSession() {
  const raw = sessionStorage.getItem("intellibrand_host_session");
  if (!raw) {
    console.log("Nenhuma sessão encontrada no sessionStorage");
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    state.sessionUser = parsed.sessionUser || null;
    state.selectedCompany = parsed.selectedCompany || null;
    state.selectedDashboardId = parsed.selectedDashboardId || null;
    console.log("Sessão carregada =", state);
  } catch (e) {
    console.error("Erro ao carregar sessão:", e);
  }
}

function clearSession() {
  sessionStorage.removeItem("intellibrand_host_session");
  state.sessionUser = null;
  state.selectedCompany = null;
  state.selectedDashboardId = null;

  embedController.mountedDashboardId = null;
  embedController.setter = null;

  console.log("Sessão limpa");
}

function getUser(username) {
  const uname = (username || "").trim().toLowerCase();
  const user =
    (APP_CONFIG.users || []).find(
      (u) => String(u.username || "").trim().toLowerCase() === uname
    ) || null;

  console.log("getUser()", { username, user });
  return user;
}

function getDashboard(dashboardId) {
  const did = (dashboardId || "").trim().toLowerCase();
  const dashboard =
    (APP_CONFIG.dashboards || []).find(
      (d) => String(d.id || "").trim().toLowerCase() === did
    ) || null;

  console.log("getDashboard()", { dashboardId, dashboard });
  return dashboard;
}

function getSharedData() {
  if (!state.sessionUser) {
    console.warn("getSharedData(): sem sessionUser");
    return null;
  }

  const sharedData = {
    user: state.sessionUser.username,
    allowed_companies: state.sessionUser.companies || [],
    selected_company: state.selectedCompany || null,
  };

  console.log("getSharedData() =", sharedData);
  return sharedData;
}

function renderLogin() {
  const root = document.getElementById("root");

  root.innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <h1 class="login-title">${APP_CONFIG.app_name || "Portal"}</h1>
        <p class="login-subtitle">Login mockado por config.json</p>
        <input id="login-username" class="login-input" type="text" placeholder="Digite o username" />
        <button id="login-btn" class="primary-btn">Entrar</button>
        <div id="login-msg" class="login-msg"></div>
      </div>
    </div>
  `;

  document.getElementById("login-btn").addEventListener("click", () => {
    const username = document.getElementById("login-username").value;
    console.log("Tentando login com username =", username);

    const user = getUser(username);

    if (!user) {
      document.getElementById("login-msg").textContent =
        "Usuário não encontrado no config.json";
      console.warn("Login falhou: usuário não encontrado");
      return;
    }

    state.sessionUser = user;
    state.selectedCompany = (user.companies || [])[0] || null;
    state.selectedDashboardId = null;

    embedController.mountedDashboardId = null;
    embedController.setter = null;

    console.log("Login ok. Novo estado =", state);
    saveSession();
    renderApp();
  });
}

function renderDashboardButtons() {
  const dashboards = APP_CONFIG.dashboards || [];
  console.log("Renderizando botões de dashboards =", dashboards);

  return dashboards
    .map((d) => {
      return `
      <button class="dashboard-btn" data-dashboard-id="${d.id}">
        ${d.label}
      </button>
    `;
    })
    .join("");
}

function renderApp() {
  const root = document.getElementById("root");
  const fullName = state.sessionUser?.full_name || "";
  const companies = state.sessionUser?.companies || [];

  console.log("renderApp() com estado =", JSON.parse(JSON.stringify(state)));

  root.innerHTML = `
    <div class="portal-shell">
      <header class="topbar">
        <div class="topbar-left">
          <div class="brand">${APP_CONFIG.app_name || "Portal"}</div>
        </div>

        <div class="topbar-right">
          <div class="company-box">
            <div class="topbar-label">Company</div>
            <select id="company-select" class="company-select">
              ${companies
                .map(
                  (c) => `
                <option value="${escapeHtml(c)}" ${
                    c === state.selectedCompany ? "selected" : ""
                  }>
                  ${escapeHtml(c)}
                </option>
              `
                )
                .join("")}
            </select>
          </div>

          <div class="user-box">
            <div class="topbar-label">User</div>
            <div class="user-name">${escapeHtml(fullName)}</div>
          </div>

          <button id="logout-btn" class="secondary-btn">Sair</button>
        </div>
      </header>

      <div class="portal-body portal-body--full">
        <div class="dashboard-topbar">
          <div class="dashboard-topbar-title">Dashboards</div>
          <div class="dashboard-buttons dashboard-buttons--horizontal">
            ${renderDashboardButtons()}
          </div>
        </div>

        <main class="content content--full">
          <div class="content-header">
            <div id="content-title" class="content-title">Selecione um dashboard</div>
            <div id="content-subtitle" class="content-subtitle"></div>
          </div>

          <div class="embed-wrapper">
            <div id="dash-app"></div>
          </div>
        </main>
      </div>
    </div>
  `;

  document.getElementById("logout-btn").addEventListener("click", () => {
    console.log("Logout clicado");
    clearSession();
    renderLogin();
  });

  document.getElementById("company-select").addEventListener("change", (e) => {
    state.selectedCompany = e.target.value;
    console.log("Company alterada =", state.selectedCompany);

    saveSession();

    if (state.selectedDashboardId) {
      updateOrMountEmbeddedDashboard();
    }
  });

  document.querySelectorAll("[data-dashboard-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const newDashboardId = btn.getAttribute("data-dashboard-id");
      console.log("Dashboard selecionado =", newDashboardId);

      state.selectedDashboardId = newDashboardId;
      saveSession();

      updateOrMountEmbeddedDashboard(true);
    });
  });

  if (state.selectedDashboardId) {
    console.log("Sessão já tinha dashboard selecionado, montando automaticamente");
    updateOrMountEmbeddedDashboard(true);
  }
}

function updateOrMountEmbeddedDashboard(forceRemount = false) {
  const dashboard = getDashboard(state.selectedDashboardId);
  const mountNode = document.getElementById("dash-app");
  const titleNode = document.getElementById("content-title");
  const subtitleNode = document.getElementById("content-subtitle");

  console.log("updateOrMountEmbeddedDashboard() chamado");
  console.log("dashboard =", dashboard);
  console.log("mountNode =", mountNode);

  if (!dashboard || !mountNode) {
    console.error("dashboard ou mountNode ausente", { dashboard, mountNode });
    return;
  }

  const sharedData = getSharedData();

  console.log("sharedData =", sharedData);
  console.log("url_base_pathname =", dashboard.url_base_pathname);

  titleNode.textContent = dashboard.label;
  subtitleNode.textContent = state.selectedCompany
    ? `Company selecionada: ${state.selectedCompany}`
    : "";

  console.log("window.React =", window.React);
  console.log("window.ReactDOM =", window.ReactDOM);
  console.log("window.PropTypes =", window.PropTypes);
  console.log("window.dash_embedded_component =", window.dash_embedded_component);
  console.log(
    "window.dash_embedded_component?.renderDash =",
    window.dash_embedded_component?.renderDash
  );

  if (
    !window.dash_embedded_component ||
    typeof window.dash_embedded_component.renderDash !== "function"
  ) {
    console.error("Dash Embedded Component não carregado corretamente");

    mountNode.innerHTML = `
      <div style="padding:24px; color:#b91c1c; font-weight:600;">
        Dash Embedded Component não foi carregado.
      </div>
    `;
    return;
  }

  const sameDashboardAlreadyMounted =
    embedController.mountedDashboardId === state.selectedDashboardId &&
    typeof embedController.setter === "function";

  if (sameDashboardAlreadyMounted && !forceRemount) {
    try {
      console.log("Mesmo dashboard já montado. Atualizando sharedData via setter...");
      embedController.setter(sharedData);
      console.log("sharedData atualizado com sucesso via setter");
      return;
    } catch (e) {
      console.error("Falha ao atualizar via setter. Vai remontar.", e);
    }
  }

  try {
    mountNode.innerHTML = "";

    console.log("Vai chamar renderDash2...");
    const setter = window.dash_embedded_component.renderDash(
      {
        url_base_pathname: dashboard.url_base_pathname,
      },
      "dash-app",
      sharedData
    );

    embedController.setter = setter;
    embedController.mountedDashboardId = state.selectedDashboardId;

    console.log("renderDash() chamado com sucesso");
    console.log("setter retornado =", setter);
  } catch (e) {
    console.error("Erro ao chamar renderDash():", e);

    mountNode.innerHTML = `
      <div style="padding:24px; color:#b91c1c; font-weight:600;">
        Erro ao chamar renderDash(). Veja o console do navegador.
      </div>
    `;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function start() {
  console.log("Iniciando host...");
  await loadConfig();
  loadSession();

  if (state.sessionUser) {
    console.log("Sessão existente encontrada, renderizando app");
    renderApp();
  } else {
    console.log("Sem sessão, renderizando login");
    renderLogin();
  }
}

start();