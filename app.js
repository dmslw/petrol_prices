const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const REPORTS_API_URL = "/api/reports";
const AUTH_ME_API_URL = "/api/auth/me";
const AUTH_LOGIN_API_URL = "/api/auth/login";
const AUTH_REGISTER_API_URL = "/api/auth/register";
const AUTH_LOGOUT_API_URL = "/api/auth/logout";
const ADMIN_OVERVIEW_API_URL = "/api/admin/overview";
const POLAND_VIEW = {
  center: [52.1, 19.4],
  zoom: 6
};

const form = document.querySelector("#price-form");
const loginForm = document.querySelector("#login-form");
const registerForm = document.querySelector("#register-form");
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
const adminPanel = document.querySelector("#admin-panel");
const adminUsers = document.querySelector("#admin-users");
const adminReports = document.querySelector("#admin-reports");

let map;
let markersLayer;
let allStations = [];
let visibleStations = [];
let stationIndex = new Map();
let reports = [];
let currentUser = null;

function getStationId(element) {
  return `${element.type}/${element.id}`;
}

function toStation(element) {
  const tags = element.tags || {};
  const houseNumber = tags["addr:housenumber"] ? ` ${tags["addr:housenumber"]}` : "";

  return {
    id: getStationId(element),
    name: tags.name || tags.brand || "Stacja paliw",
    brand: tags.brand || tags.name || "Nieznana siec",
    city: tags["addr:city"] || tags["addr:place"] || "Polska",
    address: tags["addr:street"]
      ? `${tags["addr:street"]}${houseNumber}`
      : "Adres nieznany",
    lat: element.lat ?? element.center?.lat,
    lon: element.lon ?? element.center?.lon
  };
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
  } else {
    authStatus.textContent = "Nie jestes zalogowany";
    authorDisplayInput.value = "";
    logoutButton.classList.add("hidden");
    showLoginButton.classList.remove("hidden");
    showRegisterButton.classList.remove("hidden");
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

  visibleStations = allStations.filter((station) => {
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
}

function renderMarkers() {
  markersLayer.clearLayers();

  visibleStations.forEach((station) => {
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

async function fetchStations() {
  mapStatus.textContent = "Pobieram stacje z mapy...";

  const bounds = map.getBounds();
  const query = `
    [out:json][timeout:25];
    (
      node["amenity"="fuel"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
      way["amenity"="fuel"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
      relation["amenity"="fuel"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
    );
    out center tags;
  `;

  try {
    const response = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=UTF-8"
      },
      body: query
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const fetchedStations = (data.elements || [])
      .map(toStation)
      .filter((station) => Number.isFinite(station.lat) && Number.isFinite(station.lon));

    mergeStations(fetchedStations);
    mapStatus.textContent = `Wczytano ${fetchedStations.length} stacji dla aktualnego widoku mapy.`;
  } catch (error) {
    console.error("Nie udalo sie pobrac stacji:", error);
    mergeStations(getFallbackStationsFromReports());
    mapStatus.textContent = "Nie udalo sie pobrac danych z mapy. Pokazuje stacje z zapisanych zgloszen.";
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
    formMessage.textContent = "Wylogowano.";
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
    fetchStations();
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
}

async function bootstrap() {
  initMap();

  try {
    await Promise.all([loadCurrentUser(), loadReports()]);
    await loadAdminOverview();
  } catch (error) {
    console.error("Nie udalo sie zaladowac danych startowych:", error);
    formMessage.textContent = "Backend nie odpowiada. Uruchom serwer Node.";
  }

  mergeStations(getFallbackStationsFromReports());
  fetchStations();
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

showLoginButton.addEventListener("click", () => {
  loginPanel.classList.toggle("hidden");
  registerPanel.classList.add("hidden");
});

showRegisterButton.addEventListener("click", () => {
  registerPanel.classList.toggle("hidden");
  loginPanel.classList.add("hidden");
});

logoutButton.addEventListener("click", logout);
searchInput.addEventListener("input", applyFilters);
fuelFilter.addEventListener("change", applyFilters);
form.addEventListener("submit", submitReport);
loginForm.addEventListener("submit", (event) =>
  handleAuthSubmit(event, AUTH_LOGIN_API_URL, "Zalogowano pomyslnie.")
);
registerForm.addEventListener("submit", (event) =>
  handleAuthSubmit(event, AUTH_REGISTER_API_URL, "Konto utworzone i zalogowane.")
);

bootstrap();
