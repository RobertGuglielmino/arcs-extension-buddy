const { app, BrowserWindow, Menu, Tray, nativeImage } = require("electron");
const path = require("path");
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const bodyParser = require("body-parser");
const http = require("http");
const socketIo = require("socket.io");
const fs = require("fs");
const os = require("os");
const zlib = require("zlib");

const VERSION = "1.0.0";
const PORT = 8080;

const USER_DATA_PATH = path.join(os.homedir(), ".ttpg-twitch-helper");
const AUTH_FILE_PATH = path.join(USER_DATA_PATH, "auth-data.json");

const APPLICATION_CLIENT_ID = "kllausa1nifwm4l2vsvgus4zn05sg7";
const EXTENSION_CLIENT_ID = "u6gbub2lxe296glgvxz82ujzrb0jgv";

const JWT_SIGNING_URL =
  "https://v0-new-project-wsummzytqyl.vercel.app/api/sign-jwt";
const PUBSUB_ENDPOINT = `https://api.twitch.tv/helix/extensions/pubsub`;
const REDIRECT_URI = `http://localhost:${PORT}/auth/callback`;

let mainWindow;
let expressApp;
let server;
let io;
let startTime;
let tray = null;

let lastGameData = null;
let signedJwt = "";

let config = {
  autoReconnect: true,
  debugMode: false,
  refreshInterval: 5,
  minimizeToTray: true,
  startMinimized: false,
  autoLaunch: false,
};

let authData = {
  token: null,
  channelId: null,
  isAuthenticated: false,
};

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
console.log("Got app lock:", gotTheLock);

if (!gotTheLock) {
  console.log("Another instance is running, quitting...");
  app.quit();
} else {
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(createWindow);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    // No external icon file needed
  });

  startExpressServer();

  setTimeout(() => {
    mainWindow.loadURL(`http://localhost:${PORT}`);
  }, 1000);

  createTray();

  mainWindow.on("closed", function () {
    mainWindow = null;
  });

  mainWindow.on("close", function (event) {
    if (config.minimizeToTray && !app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  if (config.startMinimized) mainWindow.minimize();
}

function createTray() {
  try {
    tray = new Tray(
      nativeImage.createFromPath(path.join(__dirname, "assets", "icon.png"))
    );

    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Open Dashboard",
        click: () => {
          mainWindow.show();
        },
      },
      {
        label: "Twitch Authentication",
        click: () => {
          const authWindow = new BrowserWindow({
            width: 800,
            height: 700,
            parent: mainWindow,
            modal: true,
          });

          authWindow.loadURL(`http://localhost:${PORT}/auth`);

          authWindow.on("closed", () => {
            if (mainWindow) {
              mainWindow.webContents.reload();
            }
          });
        },
      },
      { type: "separator" },
      {
        label: "Debug Mode",
        type: "checkbox",
        checked: config.debugMode,
        click: (menuItem) => {
          config.debugMode = menuItem.checked;
          io.emit("config_updated", config);
        },
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ]);

    tray.setToolTip("TTPG Twitch Extension Helper");
    tray.setContextMenu(contextMenu);

    tray.on("click", () => {
      mainWindow.show();
    });
  } catch (error) {
    // If tray creation fails, log the error but don't crash the app
    console.error("Failed to create tray icon:", error.message);
    console.log("The application will continue without a tray icon");
  }
}

/*
######################
    EXPRESS SERVER
######################
*/

function startExpressServer() {
  startTime = Date.now();
  expressApp = express();
  server = http.createServer(expressApp);
  io = socketIo(server);

  loadSavedAuthData();

  // Middleware
  expressApp.use(cors());
  expressApp.use(bodyParser.json({ limit: "5mb" }));
  expressApp.use(express.static(path.join(__dirname, "public")));

  expressApp.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  });

  expressApp.get("/auth", (req, res) => {
    const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${APPLICATION_CLIENT_ID}&redirect_uri=${encodeURIComponent(
      REDIRECT_URI
    )}&response_type=token&scope=channel:read:subscriptions`;

    res.redirect(authUrl);
  });

  expressApp.get("/auth/callback", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "callback.html"));
  });

  expressApp.post("/auth/complete", (req, res) => {
    const { access_token } = req.body;

    if (!access_token) {
      return res.status(400).json({ error: "No access token provided" });
    }

    // Get the channel ID using the token
    axios
      .get("https://api.twitch.tv/helix/users", {
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Client-ID": APPLICATION_CLIENT_ID,
        },
      })
      .then((response) => {
        const userData = response.data.data[0];

        setAuthData(access_token, userData);

        ioEmitTwitchLogin(userData);
        res.json({ success: true });
      })
      .catch((err) => {
        console.error("Error getting user data:", err.message);
        res.status(500).json({ error: "Failed to get user data" });
      });
  });

  expressApp.post("/auth/logout", (req, res) => {
    clearAuthData();

    try {
      if (fs.existsSync(AUTH_FILE_PATH)) {
        fs.unlinkSync(AUTH_FILE_PATH);
      }
    } catch (error) {
      console.error("Error removing auth file:", error.message);
    }

    ioEmitTwitchLogout();
    res.json({ success: true });
  });

  expressApp.post("/postkey_ttpg", async (req, res) => {
    const gameData = convertJSONToGameData(req.body);

    if (!authData.isAuthenticated) {
      return res.status(401).json({ error: "Not authenticated with Twitch" });
    }

    try {
      signedJwt = await getNewSignedJWT();

      const pubsubResult = await sendToPubSub(signedJwt, gameData);

      ioEmitPubsubSuccess();
      res.json({ success: true });

    } catch (err) {
      console.error("Error processing game data:", err.message);
      ioEmitPubsubFailure(err);
      res
        .status(500)
        .json({ error: "Error processing game data: " + err.message });

    }
  });

  expressApp.get("/api/status", (req, res) => {
    const status = {
      version: VERSION,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      authenticated: authData.isAuthenticated,
      channelId: authData.channelId,
      lastDataReceived: lastGameData ? new Date().toISOString() : null,
      config: config,
      system: {
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
        memory: {
          total: Math.floor(os.totalmem() / (1024 * 1024)),
          free: Math.floor(os.freemem() / (1024 * 1024)),
        },
      },
    };

    res.json(status);
  });

  expressApp.post("/api/config", (req, res) => {
    const newConfig = req.body;

    if (!newConfig) {
      return res.status(400).json({ error: "Invalid configuration" });
    }

    updateConfig(newConfig);
    res.json({ success: true });
  });

  io.on("connection", (socket) => {
    console.log("UI client connected");
    socketEmitConfigUpdate(socket);
    socketEmitAuthStatus(socket);
    socketEmitGameData(socket);


    socket.on("request_status", () => {
      socketEmitAuthStatus(socket);
      socketEmitGameData(socket);
    });

    socket.on("update_config", (newConfig) => {
      updateConfig(newConfig);
    });

    socket.on("disconnect", () => {
      console.log("UI client disconnected");
    });
  });

  server.listen(PORT, () => {
    const networkInterfaces = os.networkInterfaces();
    let localIp = "localhost";

    // Try to find the local IP address
    Object.keys(networkInterfaces).forEach((ifname) => {
      networkInterfaces[ifname].forEach((iface) => {
        if (iface.family === "IPv4" && !iface.internal) {
          localIp = iface.address;
        }
      });
    });

    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Or access via local network: http://${localIp}:${PORT}`);
    console.log(
      `To authenticate with Twitch, visit http://localhost:${PORT}/auth`
    );
  });
}


app.on("will-quit", () => {
  if (server) server.close();
});

app.on("activate", function () {
  if (mainWindow === null) createWindow();
});

app.on("window-all-closed", function () {
  // On macOS applications should keep open until the user quits explicitly
  if (process.platform !== "darwin") app.quit();
});


// TRANSFORM HELPER FUNCTIONS

function convertJSONToGameData(input) {
  if (config.debugMode) {
    console.log(
      "Received game data:",
      JSON.stringify(gameData).substring(0, 100) + "..."
    );
  }

  const players = input.players;
  const ambitions = input.ambitions;
  const court = input.court;

  const getAmbitionRanking = (id) => {
    const ambition = ambitions.find((a) => a.id === id);
    return ambition ? ambition.ranking : new Array(players.length).fill(0);
  };

  const getAmbitionPodium = (id) => {
    const ambition = ambitions.find((a) => a.id === id);

    if (!ambition) {
      console.error("not valid ambition!");
      return [[-1], [-1]];
    }

    const podium = [[0], [0]];

    const sortedAmbitions = [...ambition.ranking].sort().reverse();
    const firstAmount = sortedAmbitions[0];
    const secondAmount = sortedAmbitions[1];
    const thirdAmount = ambition.ranking.length >= 3 ? sortedAmbitions[2] : -1;

    const tiedForFirst = firstAmount == secondAmount;
    const tiedForSecond = secondAmount == thirdAmount && !tiedForFirst;

    function getMultipleSecondPlaces() {
      let secondArray = [];

      ambition.ranking.forEach((val, index) => {
        if (val == firstAmount) secondArray.push(index);
      });

      return secondArray;
    }

    podium[0] = tiedForFirst ? [] : [ambition.ranking.indexOf(firstAmount)];
    podium[1] = tiedForFirst
      ? getMultipleSecondPlaces()
      : tiedForSecond
      ? []
      : [ambition.ranking.indexOf(secondAmount)];

    return podium;
  };

  const getColorFromHex = (color) => {
    switch (color) {
      case "0095A9":
        return "blue";
      case "FFB700":
        return "yellow";
      case "D7D2CB":
        return "white";
      case "E1533D":
        return "red";
      default:
        return "white";
    }
  };

  const playerData = {
    name: players.map((p) => p.name || ""),
    fate: players.map(
      (p) => p.cards.filter((card) => card.includes("FATE"))[0]
    ),
    color: players.map((p) => getColorFromHex(p.color)),
    power: players.map((p) => p.power),
    objectiveProgress: players.map((p) => p.objective || 0),
    resources: players.map((p) =>
      p.resources.map((resource) => (resource === null ? "" : resource))
    ),
    supply: {
      cities: players.map((p) => p.cities),
      starports: players.map((p) => p.spaceports),
      ships: players.map((p) => p.ships),
      agents: players.map((p) => p.agents),
      favors: players.map(() => []),
    },
    outrage: players.map((p) => {
      return Array.isArray(p.outrage)
        ? p.outrage.map(() => true)
        : [false, false, false, false, false];
    }),
    courtCards: players.map((p) => p.court || []),
    ambitionProgress: {
      tycoon: getAmbitionRanking("tycoon"),
      tyrant: getAmbitionRanking("tyrant"),
      warlord: getAmbitionRanking("warlord"),
      keeper: getAmbitionRanking("keeper"),
      empath: getAmbitionRanking("empath"),
      blightkin: getAmbitionRanking("blightkin"),
      edenguard: getAmbitionRanking("edenguard"),
    },
    hasFlagship: [false, false, false, false],
    flagshipBoard: [undefined, undefined, undefined, undefined],
    titles: players.map((p) => p.titles),
  };

  // Extract general data
  const gameData = {
    isCampaign: input.campaign,
    hasBlightkin: false, //playerData.fate.includes(Fates.Naturalist),
    hasEdenguard: false, //playerData.fate.includes(Fates.Guardian),
    ambitionDeclarations: ambitions.map((a) => a.declared),
    ambitionPodium: {
      tycoon: getAmbitionPodium("tycoon"),
      tyrant: getAmbitionPodium("tyrant"),
      warlord: getAmbitionPodium("warlord"),
      keeper: getAmbitionPodium("keeper"),
      empath: getAmbitionPodium("empath"),
      blightkin: getAmbitionPodium("blightkin"),
      edenguard: getAmbitionPodium("edenguard"),
    },
    courtCards: court.map((c) => ({
      id: c.id,
      agents: c.influence
        .map((value, index) => ({
          color: getColorFromHex(players[index]?.color),
          value: value,
        }))
        .filter((agent) => agent.value > 0), // Only include agents with influence > 0
    })),
    edicts: input.edicts || [],
    laws: input.laws || [],
  };

  // state updates
  const newData = {
    playerData,
    gameData,
  };
  
  lastGameData = newData;
  ioEmitGameData(newData);

  return newData;
}


// API HELPER FUNCTIONS

async function getNewSignedJWT() {
  if (signedJwt !== "") return signedJwt;

  try {
    console.log("Attempting to sign JWT...");
    const jwtPayload = {
      user_id: authData.channelId,
      role: "external",
      channel_id: authData.channelId,
      pubsub_perms: {
        send: ["broadcast"],
      },
    };

    // Get the JWT signed by the serverless function
    const signResponse = await axios.post(JWT_SIGNING_URL, jwtPayload);
    const newSignedJwt = signResponse.data.token;
    console.log("JWT signed successfully.");

    return newSignedJwt;
  } catch {
    throw new Error("Failed to sign JWT");
  }
}

async function sendToPubSub(jwt, data) {
  try {
    const compressedBuffer = zlib.gzipSync(
      Buffer.from(JSON.stringify(data), "utf8")
    );
    const base64String = Buffer.from(compressedBuffer).toString("base64");

    const payload = {
      broadcaster_id: authData.channelId,
      message: JSON.stringify({
        compressed: true,
        data: base64String,
      }),
      target: ["broadcast"],
    };

    const headers = {
      Authorization: `Bearer ${jwt}`,
      "Client-ID": EXTENSION_CLIENT_ID,
      "Content-Type": "application/json",
    };

    // Log the request details (only in debug mode)
    if (config.debugMode) {
      console.log("PubSub Request:", {
        PUBSUB_ENDPOINT,
        headers: { ...headers, Authorization: "Bearer [TOKEN HIDDEN]" },
        payload: {
          ...payload,
        },
      });
    }

    const response = await axios.post(PUBSUB_ENDPOINT, payload, { headers });

    console.log("Data sent to PubSub successfully");
    return response.data;
  } catch (err) {
    console.error("=== PubSub Error Details ===");
    console.error(`Status: ${err.response?.status || "Unknown"}`);
    console.error(`Message: ${err.message}`);
    console.error("Channel ID:", authData.channelId);
    console.error("==========================");

    throw err;
  }
}


// IO EMITTER HELPER FUNCTIONS

function ioEmitGameData(gameData) {
  io.emit("ttpg_data", gameData);
}

function ioEmitTwitchLogin(userData) {
  io.emit("auth_status", {
    authenticated: true,
    channelId: userData.id,
    username: userData.login,
    displayName: userData.display_name,
  });
}

function ioEmitTwitchLogout() {
  io.emit("auth_status", {
    authenticated: false,
    channelId: null,
    username: null,
    displayName: null,
  });
}

function ioEmitPubsubSuccess() {
  io.emit("pubsub_status", { success: true });
}

function ioEmitPubsubFailure(err) {
  io.emit("pubsub_status", {
    success: false,
    error: err.message,
    details: err.details,
  });
}

function ioEmitConfigUpdate(config) {
  io.emit("config_updated", config);
}

// SOCKET EMITTER HELPER FUNCTIONS

function socketEmitAuthStatus(socket) {
  socket.emit("auth_status", {
    authenticated: authData.isAuthenticated,
    channelId: authData.channelId,
    username: authData.username,
    displayName: authData.displayName,
  });
}

function socketEmitGameData(socket) {
  if (lastGameData) {
    socket.emit("ttpg_data", lastGameData);
  }
}

function socketEmitConfigUpdate(socket) {
  socket.emit("config_updated", config);
}


// AUTH HELPER FUNCTIONS

function clearAuthData() {
  authData = {
    token: null,
    channelId: null,
    isAuthenticated: false,
  };
}

function setAuthData(access_token, userData) {
  authData = {
    token: access_token,
    channelId: userData.id,
    username: userData.login,
    displayName: userData.display_name,
    isAuthenticated: true,
  };

  saveAuthData();
}

function loadSavedAuthData() {
  try {
    if (!fs.existsSync(USER_DATA_PATH)) {
      fs.mkdirSync(USER_DATA_PATH, { recursive: true });
      return false;
    }

    if (fs.existsSync(AUTH_FILE_PATH)) {
      const savedData = JSON.parse(fs.readFileSync(AUTH_FILE_PATH, "utf8"));
      if (savedData && savedData.token && savedData.channelId) {
        authData = savedData;
        console.log("Loaded saved authentication data");
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error("Error loading saved auth data:", error.message);
    return false;
  }
}

function saveAuthData() {
  try {
    if (!fs.existsSync(USER_DATA_PATH)) {
      fs.mkdirSync(USER_DATA_PATH, { recursive: true });
    }
    fs.writeFileSync(AUTH_FILE_PATH, JSON.stringify(authData, null, 2));
    console.log("Authentication data saved");
  } catch (error) {
    console.error("Error saving auth data:", error.message);
  }
}


// OTHER HELPER FUNCTIONS

function updateConfig(newConfig) {
  if (newConfig) {
    config = {
      ...config,
      ...newConfig,
    };

    ioEmitConfigUpdate(config);
  }
}
