const REPORTS_API_URL = "/api/reports";
const STATIONS_API_URL = "/api/stations";
const AUTH_ME_API_URL = "/api/auth/me";
const AUTH_LOGIN_API_URL = "/api/auth/login";
const AUTH_REGISTER_API_URL = "/api/auth/register";
const AUTH_LOGOUT_API_URL = "/api/auth/logout";
const AUTH_CHANGE_PASSWORD_API_URL = "/api/auth/change-password";
const ADMIN_OVERVIEW_API_URL = "/api/admin/overview";
const ADMIN_USERS_API_URL = "/api/admin/users";
const POLAND_VIEW = {
  center: [52.1, 19.4],
  zoom: 6
};
const MAX_VISIBLE_MARKERS = 300;

const form = document.querySelector("#price-form");
const loginForm = document.querySelector("#login-form");
const registerForm = document.querySelector("#register-form");
const passwordForm = document.querySelector("#password-form");
const stationCreateForm = document.querySelector("#station-create-form");
const mapPanel = document.querySelector("#map-panel");
const stationIdInput = document.querySelector("#stationId");
const stationNameInput = document.querySelector("#stationName");
const authorDisplayInput = document.querySelector("#authorDisplay");
const stationsList = document.querySelector("#stations-list");
const stationCount = document.querySelector("#station-count");
const reportCount = document.querySelector("#report-count");
const formMessage = document.querySelector("#form-message");
const mapStatus = document.querySelector("#map-status");
const searchInput = document.querySelector("#searchInput");
const fuelFilter = document.querySelector("#fuelFilter");
const authStatus = document.querySelector("#auth-status");
const showLoginButton = document.querySelector("#show-login");
const showRegisterButton = document.querySelector("#show-register");
const logoutButton = document.querySelector("#logout-button");
const loginPanel = document.querySelector("#login-panel");
const registerPanel = document.querySelector("#register-panel");
const passwordPanel = document.querySelector("#password-panel");
const stationCreatePanel = document.querySelector("#station-create-panel");
const stationCreateHint = document.querySelector("#station-create-hint");
const startStationPickButton = document.querySelector("#start-station-pick");
const adminPanel = document.querySelector("#admin-panel");
const adminUsers = document.querySelector("#admin-users");
const adminReports = document.querySelector("#admin-reports");
const newStationLatInput = document.querySelector("#newStationLat");
const newStationLonInput = document.querySelector("#newStationLon");

let map;
let markersLayer;
let allStations = [];
let visibleStations = [];
let stationIndex = new Map();
let reports = [];
let currentUser = null;
let isPickingStationLocation = false;

function jumpToMap() {
  mapPanel.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

  mapPanel.classList.add("panel--jump");
  window.setTimeout(() => {
    mapPanel.classList.remove("panel--jump");
  }, 1600);

  if (map) {
    window.setTimeout(() => {
      map.invalidateSize();
    }, 300);
  }

  formMessage.textContent = "Kliknij stacje na mapie, aby ja wybrac.";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatPrice(price) {
  return `${Number(price).toFixed(2)} zl`;
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(dateString));
}

function sortReportsByDate(nextReports) {
  return [...nextReports].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error || `HTTP ${response.status}`);
  }

  return payload;
}

async function loadReports() {
  reports = sortReportsByDate(await fetchJson(REPORTS_API_URL));
  reportCount.textContent = String(reports.length);
}

async function loadStations() {
  const payload = await fetchJson(STATIONS_API_URL);
  const fetchedStations = (payload.stations || []).map((station) => ({
    ...station,
    brand: station.name || "Stacja paliw"
  }));
  mergeStations(fetchedStations);
  updateMapStatus();
}

async function loadCurrentUser() {
  const payload = await fetchJson(AUTH_ME_API_URL);
  currentUser = payload.user;
  updateAuthUi();
}

async function loadAdminOverview() {
  if (!currentUser || currentUser.role !== "admin") {
    adminPanel.classList.add("hidden");
    return;
  }

  const overview = await fetchJson(ADMIN_OVERVIEW_API_URL);
  adminPanel.classList.remove("hidden");
  adminUsers.innerHTML = overview.users
    .map(
      (user) => `
        <article class="admin-item">
          <strong>${escapeHtml(user.username)}</strong>
          <p>Rola: ${escapeHtml(user.role)} | Konto od ${formatDate(user.createdAt)}</p>
          <button type="button" class="secondary-button" data-reset-user="${user.id}">
            Resetuj haslo
          </button>
        </article>
      `
    )
    .join("");

  adminReports.innerHTML = overview.reports
    .slice(0, 12)
    .map(
      (report) => `
        <article class="admin-item">
          <strong>${escapeHtml(report.stationName)} - ${escapeHtml(report.fuelType)} - ${formatPrice(
            report.price
          )}</strong>
          <p>${escapeHtml(report.author)} | ${escapeHtml(report.city)}, ${escapeHtml(
            report.address
          )} | ${formatDate(report.createdAt)}</p>
          <button type="button" class="danger-button" data-delete-report="${report.id}">
            Usun zgloszenie
          </button>
        </article>
      `
    )
    .join("");
}

function updateAuthUi() {
  if (currentUser) {
    authStatus.textContent = `Zalogowany: ${currentUser.username}${currentUser.role === "admin" ? " (admin)" : ""}`;
    authorDisplayInput.value = currentUser.username;
    logoutButton.classList.remove("hidden");
    showLoginButton.classList.add("hidden");
    showRegisterButton.classList.add("hidden");
    loginPanel.classList.add("hidden");
    registerPanel.classList.add("hidden");
    passwordPanel.classList.remove("hidden");
    stationCreatePanel.classList.remove("hidden");
  } else {
    authStatus.textContent = "Nie jestes zalogowany";
    authorDisplayInput.value = "";
    logoutButton.classList.add("hidden");
    showLoginButton.classList.remove("hidden");
    showRegisterButton.classList.remove("hidden");
    passwordPanel.classList.add("hidden");
    stationCreatePanel.classList.add("hidden");
    adminPanel.classList.add("hidden");
  }
}

function getFallbackStationsFromReports() {
  const seen = new Set();

  return reports
    .filter((report) => {
      if (seen.has(report.stationId)) {
        return false;
      }

      seen.add(report.stationId);
      return true;
    })
    .map((report, index) => ({
      id: report.stationId,
      name: report.stationName || `Stacja ${index + 1}`,
      brand: report.stationName || "Stacja paliw",
      city: report.city || "Polska",
      address: report.address || "Adres nieznany",
      lat: 52.1 + index * 0.18,
      lon: 19.4 + index * 0.18
    }));
}

function setSelectedStation(stationId) {
  const station = stationIndex.get(stationId);
  if (!station) {
    return;
  }

  stationIdInput.value = station.id;
  stationNameInput.value = `${station.name} - ${station.city}, ${station.address}`;
  formMessage.textContent = `Wybrano stacje: ${station.name}.`;
}

function getFilteredReportsForStation(stationId) {
  const selectedFuel = fuelFilter.value;

  return reports.filter((report) => {
    if (report.stationId !== stationId) {
      return false;
    }

    if (selectedFuel !== "ALL" && report.fuelType !== selectedFuel) {
      return false;
    }

    return true;
  });
}

function applyFilters() {
  const query = searchInput.value.trim().toLowerCase();
  const bounds = map ? map.getBounds() : null;

  visibleStations = allStations.filter((station) => {
    if (
      bounds &&
      Number.isFinite(station.lat) &&
      Number.isFinite(station.lon) &&
      !bounds.contains([station.lat, station.lon])
    ) {
      return false;
    }

    const haystack = `${station.name} ${station.brand} ${station.city} ${station.address}`.toLowerCase();
    const matchesText = !query || haystack.includes(query);

    if (!matchesText) {
      return false;
    }

    if (fuelFilter.value === "ALL") {
      return true;
    }

    return reports.some(
      (report) => report.stationId === station.id && report.fuelType === fuelFilter.value
    );
  });

  stationCount.textContent = String(visibleStations.length);
  renderMarkers();
  renderStations();
  updateMapStatus();
}

function updateMapStatus() {
  if (!allStations.length) {
    mapStatus.textContent = "Brak stacji w lokalnej bazie.";
    return;
  }

  if (!visibleStations.length) {
    mapStatus.textContent =
      `W bazie jest ${allStations.length} stacji, ale nic nie pasuje do aktualnego widoku lub filtra.`;
    return;
  }

  const renderedCount = Math.min(visibleStations.length, MAX_VISIBLE_MARKERS);

  if (visibleStations.length > MAX_VISIBLE_MARKERS) {
    mapStatus.textContent =
      `W widoku jest ${visibleStations.length} stacji. Na mapie pokazuje pierwsze ${renderedCount}, przybliz mape aby odciazyc widok.`;
    return;
  }

  mapStatus.textContent = `W widoku mapy jest ${visibleStations.length} stacji z lokalnej bazy.`;
}

function renderMarkers() {
  markersLayer.clearLayers();

  visibleStations.slice(0, MAX_VISIBLE_MARKERS).forEach((station) => {
    if (!Number.isFinite(station.lat) || !Number.isFinite(station.lon)) {
      return;
    }

    const marker = L.marker([station.lat, station.lon]).addTo(markersLayer);
    marker.bindPopup(`
      <div class="popup-content">
        <h3>${escapeHtml(station.name)}</h3>
        <p>${escapeHtml(`${station.city}, ${station.address}`)}</p>
        <button type="button" data-station-id="${escapeHtml(station.id)}">Wybierz te stacje</button>
      </div>
    `);
  });
}

function renderStations() {
  if (!visibleStations.length) {
    stationsList.innerHTML =
      '<div class="empty-state">Brak stacji pasujacych do wyszukiwarki i filtra.</div>';
    return;
  }

  stationsList.innerHTML = visibleStations
    .map((station) => {
      const stationReports = getFilteredReportsForStation(station.id);
      const latest = stationReports[0];

      return `
        <article class="station-card">
          <div class="station-card__top">
            <div>
              <h3>${escapeHtml(station.name)}</h3>
              <p class="station-card__meta">${escapeHtml(`${station.city}, ${station.address}`)}</p>
            </div>
            <div class="station-card__badge">
              ${latest ? `Ostatnio: ${formatPrice(latest.price)}` : "Brak danych"}
            </div>
          </div>

          <button type="button" class="popup-content__button" data-choose-station="${escapeHtml(
            station.id
          )}">
            Wybierz te stacje do dodania ceny
          </button>

          <p class="station-card__reports-title">Ostatnie zgloszenia:</p>

          <div class="reports">
            ${
              stationReports.length
                ? stationReports
                    .slice(0, 4)
                    .map(
                      (report) => `
                        <div class="report-item">
                          <div>
                            <strong>${escapeHtml(report.fuelType)}: ${formatPrice(report.price)}</strong>
                            <div class="report-item__meta">
                              Dodal ${escapeHtml(report.author)} - ${formatDate(report.createdAt)}
                            </div>
                          </div>
                        </div>
                      `
                    )
                    .join("")
                : '<div class="empty-state">Ta stacja nie ma jeszcze zgloszen dla wybranego paliwa.</div>'
            }
          </div>
        </article>
      `;
    })
    .join("");
}

function mergeStations(nextStations) {
  const merged = [...nextStations];

  getFallbackStationsFromReports().forEach((fallbackStation) => {
    if (!merged.some((station) => station.id === fallbackStation.id)) {
      merged.push(fallbackStation);
    }
  });

  allStations = merged;
  stationIndex = new Map(allStations.map((station) => [station.id, station]));
  applyFilters();
}

function setStationPickMode(enabled) {
  isPickingStationLocation = enabled;
  map.getContainer().classList.toggle("map--picking", enabled);
  startStationPickButton.classList.toggle("secondary-button--active", enabled);
  stationCreateHint.textContent = enabled
    ? "Kliknij punkt na mapie, aby zapisac polozenie nowej stacji."
    : "Kliknij przycisk ponizej, a potem wybierz punkt na mapie.";
}

async function createStation(event) {
  event.preventDefault();

  if (!currentUser) {
    formMessage.textContent = "Zaloguj sie, aby dodawac stacje.";
    return;
  }

  const formData = new FormData(stationCreateForm);

  try {
    const station = await fetchJson(STATIONS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: String(formData.get("name") || ""),
        city: String(formData.get("city") || ""),
        address: String(formData.get("address") || ""),
        lat: Number(formData.get("lat")),
        lon: Number(formData.get("lon"))
      })
    });

    allStations.push({
      ...station,
      brand: station.name || "Stacja paliw"
    });
    stationIndex.set(station.id, {
      ...station,
      brand: station.name || "Stacja paliw"
    });
    stationCreateForm.reset();
    stationCreateForm.classList.add("hidden");
    setStationPickMode(false);
    map.setView([station.lat, station.lon], Math.max(map.getZoom(), 12));
    setSelectedStation(station.id);
    mapStatus.textContent = "Nowa stacja zostala dodana do lokalnej bazy.";
    applyFilters();
  } catch (error) {
    formMessage.textContent = error.message;
  }
}

async function submitReport(event) {
  event.preventDefault();

  if (!currentUser) {
    formMessage.textContent = "Zaloguj sie, aby dodawac ceny.";
    return;
  }

  const formData = new FormData(form);
  const stationId = String(formData.get("stationId") || "");
  const station = stationIndex.get(stationId);
  const price = Number(formData.get("price"));
  const fuelType = String(formData.get("fuelType"));

  if (!stationId || !station) {
    formMessage.textContent = "Najpierw wybierz stacje na mapie lub z listy.";
    return;
  }

  if (!Number.isFinite(price) || price <= 0) {
    formMessage.textContent = "Podaj poprawna cene wieksza od zera.";
    return;
  }

  try {
    const createdReport = await fetchJson(REPORTS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        stationId: station.id,
        stationName: station.name,
        city: station.city,
        address: station.address,
        fuelType,
        price
      })
    });

    reports = sortReportsByDate([createdReport, ...reports]);
    reportCount.textContent = String(reports.length);
    form.reset();
    stationIdInput.value = station.id;
    stationNameInput.value = `${station.name} - ${station.city}, ${station.address}`;
    authorDisplayInput.value = currentUser.username;
    formMessage.textContent = "Cena zostala dodana i zapisana w bazie.";
    applyFilters();
    await loadAdminOverview();
  } catch (error) {
    formMessage.textContent = error.message;
  }
}

async function handleAuthSubmit(event, url, successMessage) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const formData = new FormData(formElement);

  try {
    const payload = await fetchJson(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: String(formData.get("username") || ""),
        password: String(formData.get("password") || "")
      })
    });

    currentUser = payload.user;
    updateAuthUi();
    formMessage.textContent = successMessage;
    formElement.reset();
    await loadAdminOverview();
  } catch (error) {
    formMessage.textContent = error.message;
  }
}

async function logout() {
  try {
    await fetchJson(AUTH_LOGOUT_API_URL, { method: "POST" });
    currentUser = null;
    updateAuthUi();
    passwordForm.reset();
    formMessage.textContent = "Wylogowano.";
  } catch (error) {
    formMessage.textContent = error.message;
  }
}

async function changePassword(event) {
  event.preventDefault();

  if (!currentUser) {
    formMessage.textContent = "Zaloguj sie, aby zmienic haslo.";
    return;
  }

  const formData = new FormData(passwordForm);

  try {
    await fetchJson(AUTH_CHANGE_PASSWORD_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        currentPassword: String(formData.get("currentPassword") || ""),
        newPassword: String(formData.get("newPassword") || "")
      })
    });

    passwordForm.reset();
    formMessage.textContent = "Haslo zostalo zmienione.";
  } catch (error) {
    formMessage.textContent = error.message;
  }
}

async function resetUserPassword(userId) {
  if (!window.confirm("Zresetowac haslo tego uzytkownika? Jego biezace sesje zostana wylogowane.")) {
    return;
  }

  try {
    const payload = await fetchJson(`${ADMIN_USERS_API_URL}/${userId}/reset-password`, {
      method: "POST"
    });

    window.prompt(
      `Tymczasowe haslo dla ${payload.username} (skopiuj i przekaz uzytkownikowi):`,
      payload.temporaryPassword
    );
    formMessage.textContent = `Zresetowano haslo uzytkownika ${payload.username}.`;
  } catch (error) {
    formMessage.textContent = error.message;
  }
}

async function deleteReport(reportId) {
  try {
    await fetchJson(`${REPORTS_API_URL}/${reportId}`, { method: "DELETE" });
    reports = reports.filter((report) => report.id !== Number(reportId));
    reportCount.textContent = String(reports.length);
    applyFilters();
    await loadAdminOverview();
  } catch (error) {
    formMessage.textContent = error.message;
  }
}

function initMap() {
  map = L.map("map").setView(POLAND_VIEW.center, POLAND_VIEW.zoom);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);

  map.on("moveend", () => {
    applyFilters();
  });

  map.on("popupopen", (event) => {
    const button = event.popup.getElement()?.querySelector("[data-station-id]");
    if (!button) {
      return;
    }

    button.addEventListener("click", () => {
      setSelectedStation(button.dataset.stationId);
      map.closePopup();
    });
  });

  map.on("click", (event) => {
    if (!isPickingStationLocation) {
      return;
    }

    newStationLatInput.value = String(event.latlng.lat);
    newStationLonInput.value = String(event.latlng.lng);
    stationCreateForm.classList.remove("hidden");
    stationCreateHint.textContent =
      "Polozenie wybrane. Uzupelnij nazwe, miasto i adres nowej stacji.";
  });
}

async function bootstrap() {
  initMap();

  try {
    await Promise.all([loadCurrentUser(), loadReports(), loadStations()]);
    await loadAdminOverview();
  } catch (error) {
    console.error("Nie udalo sie zaladowac danych startowych:", error);
    formMessage.textContent = "Backend nie odpowiada. Uruchom serwer Node.";
  }
}

stationsList.addEventListener("click", (event) => {
  const chooseButton = event.target.closest("[data-choose-station]");
  if (chooseButton) {
    setSelectedStation(chooseButton.dataset.chooseStation);
    return;
  }
});

adminReports.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-report]");
  if (!deleteButton) {
    return;
  }

  deleteReport(deleteButton.dataset.deleteReport);
});

adminUsers.addEventListener("click", (event) => {
  const resetButton = event.target.closest("[data-reset-user]");
  if (!resetButton) {
    return;
  }

  resetUserPassword(resetButton.dataset.resetUser);
});

showLoginButton.addEventListener("click", () => {
  loginPanel.classList.toggle("hidden");
  registerPanel.classList.add("hidden");
});

showRegisterButton.addEventListener("click", () => {
  registerPanel.classList.toggle("hidden");
  loginPanel.classList.add("hidden");
});

startStationPickButton.addEventListener("click", () => {
  if (!currentUser) {
    formMessage.textContent = "Zaloguj sie, aby dodawac stacje.";
    return;
  }

  setStationPickMode(!isPickingStationLocation);
  if (!isPickingStationLocation) {
    stationCreateForm.classList.add("hidden");
  }
  jumpToMap();
});

logoutButton.addEventListener("click", logout);
searchInput.addEventListener("input", applyFilters);
fuelFilter.addEventListener("change", applyFilters);
form.addEventListener("submit", submitReport);
stationCreateForm.addEventListener("submit", createStation);
loginForm.addEventListener("submit", (event) =>
  handleAuthSubmit(event, AUTH_LOGIN_API_URL, "Zalogowano pomyslnie.")
);
registerForm.addEventListener("submit", (event) =>
  handleAuthSubmit(event, AUTH_REGISTER_API_URL, "Konto utworzone i zalogowane.")
);
passwordForm.addEventListener("submit", changePassword);
stationNameInput.addEventListener("click", jumpToMap);
stationNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    jumpToMap();
  }
});

bootstrap();
