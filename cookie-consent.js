(function () {
  const STORAGE_KEY = "cookie-consent";
  const VALID = ["all", "essential"];

  function getConsent() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return VALID.includes(value) ? value : null;
    } catch (error) {
      return null;
    }
  }

  function storeConsent(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (error) {
      // localStorage moze byc niedostepny (tryb prywatny) - dzialamy dalej bez zapisu.
    }
    window.cookieConsent = value;
    document.dispatchEvent(new CustomEvent("cookie-consent-change", { detail: value }));
    if (value === "all") {
      loadMarketingScripts();
    }
  }

  // Tu w przyszlosci laduja sie skrypty reklamowe/analityczne (np. Google AdSense),
  // WYLACZNIE po zgodzie uzytkownika ("Akceptuje wszystkie").
  let marketingLoaded = false;
  function loadMarketingScripts() {
    if (marketingLoaded) {
      return;
    }
    marketingLoaded = true;
    // Przyklad (odkomentuj i uzupelnij po akceptacji w AdSense):
    // const s = document.createElement("script");
    // s.async = true;
    // s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX";
    // s.crossOrigin = "anonymous";
    // document.head.appendChild(s);
  }

  function removeBanner() {
    const el = document.getElementById("cookie-banner");
    if (el) {
      el.remove();
    }
  }

  function buildBanner() {
    if (document.getElementById("cookie-banner")) {
      return;
    }

    const banner = document.createElement("div");
    banner.id = "cookie-banner";
    banner.className = "cookie-banner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Zgoda na pliki cookies");
    banner.innerHTML =
      '<div class="cookie-banner__text">' +
      "<strong>Pliki cookies</strong>" +
      "<p>Uzywamy niezbednych plikow cookies, aby serwis dzialal (np. utrzymanie zalogowania). " +
      "Za Twoja zgoda mozemy tez uzywac cookies marketingowych/reklamowych. Szczegoly w " +
      '<a href="/polityka-prywatnosci.html">Polityce prywatnosci</a>.</p>' +
      "</div>" +
      '<div class="cookie-banner__actions">' +
      '<button type="button" class="secondary-button" data-consent="essential">Tylko niezbedne</button>' +
      '<button type="button" class="cookie-banner__accept" data-consent="all">Akceptuje wszystkie</button>' +
      "</div>";

    banner.addEventListener("click", function (event) {
      const button = event.target.closest("[data-consent]");
      if (!button) {
        return;
      }
      storeConsent(button.dataset.consent);
      removeBanner();
    });

    document.body.appendChild(banner);
  }

  // Pozwala ponownie otworzyc ustawienia (np. z linku w stopce) - wymog RODO (mozliwosc zmiany zgody).
  window.openCookieSettings = function () {
    buildBanner();
  };

  function init() {
    const consent = getConsent();
    window.cookieConsent = consent;

    const settingsLink = document.getElementById("cookie-settings-link");
    if (settingsLink) {
      settingsLink.addEventListener("click", function (event) {
        event.preventDefault();
        window.openCookieSettings();
      });
    }

    if (!consent) {
      buildBanner();
    } else if (consent === "all") {
      loadMarketingScripts();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
