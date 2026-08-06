// Reporting page: collects a sighting report and automatically builds a
// "sky report" (weather, planets/stars, satellites, aircraft, meteor
// showers) for the reported time and place, using only free/keyless APIs
// plus locally-hosted satellite orbital data (see js/satellite-data.js).
(() => {
  const form = document.querySelector("#report-form");
  if (!form) return;

  // ---------------------------------------------------------------------
  // Static reference data — update periodically by hand, no API needed.
  // ---------------------------------------------------------------------

  const METEOR_SHOWERS = [
    { name: "Quadrantids", start: "01-01", end: "01-05" },
    { name: "Lyrids", start: "04-16", end: "04-25" },
    { name: "Eta Aquariids", start: "04-19", end: "05-28" },
    { name: "Southern Delta Aquariids", start: "07-12", end: "08-23" },
    { name: "Perseids", start: "07-17", end: "08-24" },
    { name: "Southern Taurids", start: "09-10", end: "11-20" },
    { name: "Orionids", start: "10-02", end: "11-07" },
    { name: "Northern Taurids", start: "10-20", end: "12-10" },
    { name: "Leonids", start: "11-06", end: "11-30" },
    { name: "Geminids", start: "12-04", end: "12-20" },
    { name: "Ursids", start: "12-17", end: "12-26" },
  ];

  // Currently known naked-eye-bright comets. There is no live "is a comet
  // visible right now" API — this list needs updating by hand as comets
  // come and go. Empty by default.
  const KNOWN_COMETS = [];

  // Brightest stars (J2000 RA/Dec in degrees) — astronomy-engine only
  // covers solar-system bodies, so fixed stars are hardcoded here.
  const BRIGHT_STARS = [
    { name: "Sirius", ra: 101.287, dec: -16.716 },
    { name: "Canopus", ra: 95.988, dec: -52.696 },
    { name: "Arcturus", ra: 213.915, dec: 19.182 },
    { name: "Vega", ra: 279.234, dec: 38.784 },
    { name: "Capella", ra: 79.172, dec: 45.998 },
    { name: "Rigel", ra: 78.634, dec: -8.202 },
    { name: "Procyon", ra: 114.825, dec: 5.225 },
    { name: "Betelgeuse", ra: 88.793, dec: 7.407 },
    { name: "Altair", ra: 297.696, dec: 8.868 },
    { name: "Aldebaran", ra: 68.98, dec: 16.509 },
    { name: "Antares", ra: 247.352, dec: -26.432 },
    { name: "Spica", ra: 201.298, dec: -11.161 },
    { name: "Polaris", ra: 37.955, dec: 89.264 },
    { name: "Deneb", ra: 310.358, dec: 45.28 },
  ];

  const WEATHER_CODES = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Depositing rime fog",
    51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
    61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
    80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
    95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail",
  };

  // ---------------------------------------------------------------------
  // DOM references
  // ---------------------------------------------------------------------

  const anonymousCheckbox = document.querySelector("#anonymous");
  const contactFields = document.querySelector("#contact-fields");
  const locationText = document.querySelector("#location-text");
  const locationLat = document.querySelector("#location-lat");
  const locationLon = document.querySelector("#location-lon");
  const locationStatus = document.querySelector("#location-status");
  const useLocationBtn = document.querySelector("#use-location-btn");
  const dateInput = document.querySelector("#sighting-date");
  const timeInput = document.querySelector("#sighting-time");
  const generateBtn = document.querySelector("#generate-report-btn");
  const generateStatus = document.querySelector("#generate-status");
  const dashboard = document.querySelector("#dashboard");
  const dashboardGrid = document.querySelector("#dashboard-grid");
  const submitBtn = document.querySelector("#submit-report-btn");
  const submitStatus = document.querySelector("#submit-status");

  let lastSkyReport = null;

  // Default the date/time fields to now, for convenience.
  const now = new Date();
  dateInput.value = now.toISOString().slice(0, 10);
  timeInput.value = now.toTimeString().slice(0, 5);

  // ---------------------------------------------------------------------
  // Anonymous toggle
  // ---------------------------------------------------------------------

  anonymousCheckbox.addEventListener("change", () => {
    const isAnon = anonymousCheckbox.checked;
    contactFields.classList.toggle("field-grid--disabled", isAnon);
    contactFields.querySelectorAll("input").forEach((input) => {
      input.disabled = isAnon;
      if (isAnon) input.value = "";
    });
  });

  // ---------------------------------------------------------------------
  // Location
  // ---------------------------------------------------------------------

  useLocationBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      locationStatus.textContent = "Geolocation isn't supported by your browser — please enter your location manually.";
      return;
    }
    locationStatus.textContent = "Finding your location…";
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        locationLat.value = latitude;
        locationLon.value = longitude;
        try {
          const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`);
          const data = await res.json();
          const place = [data.locality, data.city, data.principalSubdivision, data.countryName].filter(Boolean);
          const label = place.length ? [...new Set(place)].slice(0, 3).join(", ") : `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
          locationText.value = label;
          locationStatus.textContent = "Location found.";
        } catch {
          locationText.value = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
          locationStatus.textContent = "Location found (couldn't resolve a place name).";
        }
      },
      (err) => {
        locationStatus.textContent = `Couldn't get your location (${err.message}) — please enter it manually.`;
      }
    );
  });

  async function resolveCoordinates() {
    if (locationLat.value && locationLon.value) {
      return { lat: parseFloat(locationLat.value), lon: parseFloat(locationLon.value) };
    }
    const query = locationText.value.trim();
    if (!query) return null;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`);
      const results = await res.json();
      if (results && results[0]) {
        const lat = parseFloat(results[0].lat);
        const lon = parseFloat(results[0].lon);
        locationLat.value = lat;
        locationLon.value = lon;
        return { lat, lon };
      }
    } catch {
      /* fall through */
    }
    return null;
  }

  // ---------------------------------------------------------------------
  // Weather (Open-Meteo — free, no key)
  // ---------------------------------------------------------------------

  async function fetchWeather(lat, lon, when) {
    const dateStr = when.toISOString().slice(0, 10);
    const daysDiff = Math.floor((when - now) / 86400000);
    const useArchive = daysDiff < -5;
    const base = useArchive
      ? "https://archive-api.open-meteo.com/v1/archive"
      : "https://api.open-meteo.com/v1/forecast";
    const url = `${base}?latitude=${lat}&longitude=${lon}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m,weathercode,cloudcover,windspeed_10m,visibility&timezone=auto`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Weather lookup failed (${res.status})`);
    const data = await res.json();
    const hours = data.hourly?.time || [];
    const targetHour = `${dateStr}T${String(when.getHours()).padStart(2, "0")}:00`;
    const idx = hours.indexOf(targetHour);
    if (idx === -1) throw new Error("No weather data for that hour");

    return {
      temperature: data.hourly.temperature_2m[idx],
      cloudCover: data.hourly.cloudcover[idx],
      windSpeed: data.hourly.windspeed_10m[idx],
      visibility: data.hourly.visibility?.[idx],
      description: WEATHER_CODES[data.hourly.weathercode[idx]] || `Code ${data.hourly.weathercode[idx]}`,
    };
  }

  // ---------------------------------------------------------------------
  // Astronomy — planets, moon, sun, bright stars (astronomy-engine, no key)
  // ---------------------------------------------------------------------

  function computeAstronomy(lat, lon, when) {
    const observer = new Astronomy.Observer(lat, lon, 0);
    const time = Astronomy.MakeTime(when);

    const sunEq = Astronomy.Equator(Astronomy.Body.Sun, time, observer, true, true);
    const sunHor = Astronomy.Horizon(time, observer, sunEq.ra, sunEq.dec, "normal");
    const isDaylight = sunHor.altitude > -6;
    const isFullDark = sunHor.altitude < -18;

    const bodies = ["Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Moon"];
    const planets = bodies.map((name) => {
      const eq = Astronomy.Equator(Astronomy.Body[name], time, observer, true, true);
      const hor = Astronomy.Horizon(time, observer, eq.ra, eq.dec, "normal");
      return { name, altitude: hor.altitude, azimuth: hor.azimuth, visible: hor.altitude > 0 };
    }).filter((p) => p.visible);

    const stars = BRIGHT_STARS.map((star) => {
      const hor = Astronomy.Horizon(time, observer, star.ra / 15, star.dec, "normal");
      return { name: star.name, altitude: hor.altitude, visible: hor.altitude > 0 };
    }).filter((s) => s.visible);

    return {
      sunAltitude: sunHor.altitude,
      isDaylight,
      isFullDark,
      planets,
      stars: isFullDark ? stars : [],
    };
  }

  // ---------------------------------------------------------------------
  // Satellites — ISS / Starlink / bright satellites (satellite.js + local
  // Celestrak TLE data fetched server-side, see js/satellite-data.js)
  // ---------------------------------------------------------------------

  function checkSatellitePasses(tleList, lat, lon, when, sunAltitude, limit) {
    const observerGd = { latitude: satellite.degreesToRadians(lat), longitude: satellite.degreesToRadians(lon), height: 0.1 };
    const gmst = satellite.gstime(when);
    const visible = [];

    // Satellites are only visible to the eye when it's dark for the
    // observer but the satellite itself is still in sunlight — approximated
    // here as "observer in twilight/night" rather than modelling Earth's
    // shadow precisely.
    const observerInDark = sunAltitude < 0;
    if (!observerInDark || typeof satellite === "undefined") return visible;

    for (const sat of tleList) {
      if (visible.length >= limit) break;
      try {
        const satrec = satellite.twoline2satrec(sat.line1, sat.line2);
        const posVel = satellite.propagate(satrec, when);
        if (!posVel.position) continue;
        const positionEcf = satellite.eciToEcf(posVel.position, gmst);
        const lookAngles = satellite.ecfToLookAngles(observerGd, positionEcf);
        const elevationDeg = satellite.radiansToDegrees(lookAngles.elevation);
        if (elevationDeg > 10) {
          visible.push({ name: sat.name, elevation: Math.round(elevationDeg) });
        }
      } catch {
        /* skip unparsable TLE */
      }
    }
    return visible;
  }

  function computeSatellites(lat, lon, when, sunAltitude) {
    if (typeof satelliteData === "undefined") {
      return { available: false };
    }
    return {
      available: true,
      updatedAt: satelliteData.updatedAt,
      iss: checkSatellitePasses(satelliteData.iss, lat, lon, when, sunAltitude, 1),
      starlink: checkSatellitePasses(satelliteData.starlink, lat, lon, when, sunAltitude, 5),
      visual: checkSatellitePasses(satelliteData.visual, lat, lon, when, sunAltitude, 8),
    };
  }

  // ---------------------------------------------------------------------
  // Aircraft — airplanes.live (free, no key, CORS-friendly community ADS-B
  // aggregator). Live data only — no historical access, so this is skipped
  // for past/future reports.
  // ---------------------------------------------------------------------

  async function fetchAircraft(lat, lon, when) {
    const minutesFromNow = Math.abs(when - now) / 60000;
    if (minutesFromNow > 15) {
      return { available: false, reason: "Live aircraft data only covers real-time reports, not this date/time." };
    }
    const radiusNm = 25;
    const url = `https://api.airplanes.live/v2/point/${lat}/${lon}/${radiusNm}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const aircraft = (data.ac || [])
      .filter((a) => a.flight || a.r)
      .slice(0, 10)
      .map((a) => ({
        callsign: (a.flight || a.r || "Unknown").trim(),
        type: a.desc || a.t || "Unknown type",
        altitude: a.alt_baro,
      }));
    return { available: true, aircraft };
  }

  // ---------------------------------------------------------------------
  // Meteor showers
  // ---------------------------------------------------------------------

  function activeMeteorShowers(when) {
    const md = `${String(when.getMonth() + 1).padStart(2, "0")}-${String(when.getDate()).padStart(2, "0")}`;
    return METEOR_SHOWERS.filter((shower) => {
      if (shower.start <= shower.end) return md >= shower.start && md <= shower.end;
      return md >= shower.start || md <= shower.end; // wraps year end (Ursids etc. don't, but keep this safe)
    }).map((s) => s.name);
  }

  // ---------------------------------------------------------------------
  // Dashboard rendering
  // ---------------------------------------------------------------------

  function card(title, bodyHtml) {
    return `<div class="dashboard-card"><h3>${title}</h3>${bodyHtml}</div>`;
  }

  function renderDashboard(report) {
    const cards = [];

    if (report.weather.error) {
      cards.push(card("Weather", `<p class="dashboard-muted">${report.weather.error}</p>`));
    } else {
      const w = report.weather;
      cards.push(card("Weather", `
        <p class="dashboard-stat">${w.description}</p>
        <ul class="dashboard-list">
          <li>Temperature: ${w.temperature}°C</li>
          <li>Cloud cover: ${w.cloudCover}%</li>
          <li>Wind speed: ${w.windSpeed} km/h</li>
        </ul>
      `));
    }

    const a = report.astronomy;
    cards.push(card("Sky Darkness", `
      <p class="dashboard-stat">${a.isFullDark ? "Fully dark" : a.isDaylight ? "Daylight" : "Twilight"}</p>
      <ul class="dashboard-list"><li>Sun altitude: ${a.sunAltitude.toFixed(1)}°</li></ul>
    `));

    cards.push(card("Planets Visible", a.planets.length
      ? `<ul class="dashboard-list">${a.planets.map((p) => `<li>${p.name} (${p.altitude.toFixed(0)}° above horizon)</li>`).join("")}</ul>`
      : `<p class="dashboard-muted">No planets above the horizon at this time.</p>`));

    cards.push(card("Bright Stars Visible", a.stars.length
      ? `<ul class="dashboard-list">${a.stars.map((s) => `<li>${s.name}</li>`).join("")}</ul>`
      : `<p class="dashboard-muted">${a.isFullDark ? "None of the brightest stars were above the horizon." : "Sky isn't dark enough yet to judge stars."}</p>`));

    const sat = report.satellites;
    if (!sat.available) {
      cards.push(card("Satellites", `<p class="dashboard-muted">Satellite data isn't available right now.</p>`));
    } else {
      const parts = [];
      parts.push(`<li>ISS: ${sat.iss.length ? "Visible pass overhead" : "Not visible at this time"}</li>`);
      parts.push(`<li>Starlink: ${sat.starlink.length ? `${sat.starlink.length} satellite(s) potentially visible (sampled)` : "None detected"}</li>`);
      parts.push(`<li>Other bright satellites: ${sat.visual.length ? sat.visual.length : "None detected"}</li>`);
      cards.push(card("Satellites (ISS / Starlink)", `<ul class="dashboard-list">${parts.join("")}</ul>`));
    }

    const ac = report.aircraft;
    if (!ac.available) {
      cards.push(card("Aircraft Nearby", `<p class="dashboard-muted">${ac.reason || ac.error || "Not available."}</p>`));
    } else {
      cards.push(card("Aircraft Nearby", ac.aircraft.length
        ? `<ul class="dashboard-list">${ac.aircraft.map((p) => `<li>${p.callsign} — ${p.type}${p.altitude ? ` (${p.altitude} ft)` : ""}</li>`).join("")}</ul>`
        : `<p class="dashboard-muted">No aircraft currently reporting in this area.</p>`));
    }

    cards.push(card("Meteor Showers", report.meteors.length
      ? `<ul class="dashboard-list">${report.meteors.map((m) => `<li>${m} (active)</li>`).join("")}</ul>`
      : `<p class="dashboard-muted">No major annual meteor shower is active on this date.</p>`));

    cards.push(card("Known Bright Comets", report.comets.length
      ? `<ul class="dashboard-list">${report.comets.map((c) => `<li>${c}</li>`).join("")}</ul>`
      : `<p class="dashboard-muted">No naked-eye-bright comets currently known.</p>`));

    dashboardGrid.innerHTML = cards.join("");
    dashboard.hidden = false;
  }

  // ---------------------------------------------------------------------
  // Generate Sky Report
  // ---------------------------------------------------------------------

  generateBtn.addEventListener("click", async () => {
    if (!dateInput.value || !timeInput.value) {
      generateStatus.textContent = "Please set a date and time first.";
      return;
    }

    generateStatus.textContent = "Looking up location…";
    generateBtn.disabled = true;

    const coords = await resolveCoordinates();
    if (!coords) {
      generateStatus.textContent = "Couldn't determine a location — please enter one or use \"Use My Location\".";
      generateBtn.disabled = false;
      return;
    }

    const when = new Date(`${dateInput.value}T${timeInput.value}:00`);

    generateStatus.textContent = "Gathering sky conditions…";

    const [weatherResult, aircraftResult] = await Promise.allSettled([
      fetchWeather(coords.lat, coords.lon, when),
      fetchAircraft(coords.lat, coords.lon, when),
    ]);

    const astronomy = computeAstronomy(coords.lat, coords.lon, when);
    const satellites = computeSatellites(coords.lat, coords.lon, when, astronomy.sunAltitude);

    const report = {
      location: { lat: coords.lat, lon: coords.lon, label: locationText.value },
      when: when.toISOString(),
      weather: weatherResult.status === "fulfilled" ? weatherResult.value : { error: "Weather data unavailable for this time/place." },
      astronomy,
      satellites,
      aircraft: aircraftResult.status === "fulfilled" ? aircraftResult.value : { available: false, error: "Aircraft data unavailable." },
      meteors: activeMeteorShowers(when),
      comets: KNOWN_COMETS,
    };

    lastSkyReport = report;
    renderDashboard(report);
    generateStatus.textContent = "Sky report generated.";
    generateBtn.disabled = false;
    submitBtn.disabled = false;
    dashboard.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // ---------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!lastSkyReport) {
      submitStatus.textContent = "Please generate a sky report before submitting.";
      return;
    }

    submitBtn.disabled = true;
    submitStatus.textContent = "Sending report…";

    const formData = new FormData(form);
    formData.set("sky_report", JSON.stringify(lastSkyReport, null, 2));

    try {
      const res = await fetch(form.action, {
        method: "POST",
        body: formData,
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        submitStatus.textContent = "Thank you — your report has been submitted.";
        form.reset();
        dashboard.hidden = true;
        lastSkyReport = null;
      } else {
        submitStatus.textContent = "Something went wrong sending your report — please try again.";
        submitBtn.disabled = false;
      }
    } catch {
      submitStatus.textContent = "Something went wrong sending your report — please try again.";
      submitBtn.disabled = false;
    }
  });
})();
