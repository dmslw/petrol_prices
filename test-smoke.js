const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const port = 3123;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ceny-paliw-"));
const dbPath = path.join(tmpDir, "fuel-prices.db");

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopServer(server) {
  if (server.killed) {
    return;
  }

  await new Promise((resolve) => {
    server.once("exit", () => resolve());
    server.kill();
  });
}

async function waitForServer() {
  for (let index = 0; index < 30; index += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      // Server is still starting.
    }

    await wait(250);
  }

  throw new Error("Serwer nie wystartowal na czas.");
}

async function run() {
  const server = spawn(process.execPath, ["server.js"], {
    cwd: __dirname,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      DB_PATH: dbPath,
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: "admin123"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stderr = "";
  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForServer();

    const stationsResponse = await fetch(`http://127.0.0.1:${port}/api/stations`);
    if (stationsResponse.status !== 200) {
      throw new Error(`Pobranie stacji nie powiodlo sie: ${stationsResponse.status}`);
    }

    const registerResponse = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: "tester123",
        password: "pass1234"
      })
    });

    if (registerResponse.status !== 201) {
      throw new Error(`Rejestracja nie powiodla sie: ${registerResponse.status}`);
    }

    const userCookie = registerResponse.headers.get("set-cookie");
    if (!userCookie) {
      throw new Error("Brak ciasteczka sesji po rejestracji.");
    }

    const reportResponse = await fetch(`http://127.0.0.1:${port}/api/reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: userCookie
      },
      body: JSON.stringify({
        stationId: "node/test-smoke",
        stationName: "Smoke Station",
        city: "Warszawa",
        address: "ul. Testowa 10",
        fuelType: "PB95",
        price: 6.55
      })
    });

    if (reportResponse.status !== 201) {
      throw new Error(`Dodanie zgloszenia nie powiodlo sie: ${reportResponse.status}`);
    }

    const createdReport = await reportResponse.json();

    const changePasswordResponse = await fetch(
      `http://127.0.0.1:${port}/api/auth/change-password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: userCookie
        },
        body: JSON.stringify({
          currentPassword: "pass1234",
          newPassword: "pass5678"
        })
      }
    );

    if (changePasswordResponse.status !== 200) {
      throw new Error(`Zmiana hasla nie powiodla sie: ${changePasswordResponse.status}`);
    }

    const createStationResponse = await fetch(`http://127.0.0.1:${port}/api/stations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: userCookie
      },
      body: JSON.stringify({
        name: "Nowa Stacja",
        city: "Warszawa",
        address: "ul. Dodana 12",
        lat: 52.2,
        lon: 21.01
      })
    });

    if (createStationResponse.status !== 201) {
      throw new Error(`Dodanie stacji nie powiodlo sie: ${createStationResponse.status}`);
    }

    const adminLoginResponse = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: "admin",
        password: "admin123"
      })
    });

    if (adminLoginResponse.status !== 200) {
      throw new Error(`Logowanie admina nie powiodlo sie: ${adminLoginResponse.status}`);
    }

    const adminCookie = adminLoginResponse.headers.get("set-cookie");
    if (!adminCookie) {
      throw new Error("Brak ciasteczka sesji admina.");
    }

    const overviewResponse = await fetch(`http://127.0.0.1:${port}/api/admin/overview`, {
      headers: {
        Cookie: adminCookie
      }
    });

    if (overviewResponse.status !== 200) {
      throw new Error(`Panel admina nie dziala: ${overviewResponse.status}`);
    }

    const overview = await overviewResponse.json();
    const testerUser = overview.users.find((user) => user.username === "tester123");
    if (!testerUser) {
      throw new Error("Nie znaleziono uzytkownika tester123 w panelu admina.");
    }

    const resetResponse = await fetch(
      `http://127.0.0.1:${port}/api/admin/users/${testerUser.id}/reset-password`,
      {
        method: "POST",
        headers: {
          Cookie: adminCookie
        }
      }
    );

    if (resetResponse.status !== 200) {
      throw new Error(`Reset hasla nie powiodl sie: ${resetResponse.status}`);
    }

    const { temporaryPassword } = await resetResponse.json();
    if (!temporaryPassword) {
      throw new Error("Brak tymczasowego hasla po resecie.");
    }

    const reloginResponse = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: "tester123",
        password: temporaryPassword
      })
    });

    if (reloginResponse.status !== 200) {
      throw new Error(`Logowanie tymczasowym haslem nie dziala: ${reloginResponse.status}`);
    }

    const deleteResponse = await fetch(
      `http://127.0.0.1:${port}/api/reports/${createdReport.id}`,
      {
        method: "DELETE",
        headers: {
          Cookie: adminCookie
        }
      }
    );

    if (deleteResponse.status !== 200) {
      throw new Error(`Usuwanie zgloszenia nie dziala: ${deleteResponse.status}`);
    }

    console.log("Smoke test OK");
  } finally {
    await stopServer(server);
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore temp cleanup issues on Windows.
    }
  }

  if (stderr.trim()) {
    console.error(stderr.trim());
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
