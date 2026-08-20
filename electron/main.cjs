const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env")
});

const {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
  shell,
  dialog
} = require("electron");

const fs = require("fs");
const http = require("http");
const https = require("https");
const crypto = require("crypto");

const isDev = !app.isPackaged;

const GITHUB_CLIENT_ID =
  process.env.GITHUB_CLIENT_ID || "";

const GITHUB_CLIENT_SECRET =
  process.env.GITHUB_CLIENT_SECRET || "";

const AUTH_PORT = 43821;

const REDIRECT_URI =
  `http://127.0.0.1:${AUTH_PORT}/callback`;

const TOKEN_FILE = path.join(
  app.getPath("userData"),
  "github-token.bin"
);

const SETTINGS_FILE = path.join(
  app.getPath("userData"),
  "settings.json"
);

let mainWindow = null;
let authServer = null;
let authTimeout = null;


/* =========================================================
   SETTINGS
========================================================= */

function getDefaultSettings() {
  return {
    downloadFolder: path.join(
      app.getPath("downloads"),
      "GitHub Store"
    )
  };
}

function loadSettings() {
  const defaults = getDefaultSettings();

  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      return defaults;
    }

    const raw = fs.readFileSync(
      SETTINGS_FILE,
      "utf8"
    );

    const parsed = JSON.parse(raw);

    return {
      ...defaults,
      ...parsed
    };
  } catch (error) {
    console.error(
      "Failed to load settings:",
      error
    );

    return defaults;
  }
}

function saveSettings(settings) {
  try {
    fs.mkdirSync(
      path.dirname(SETTINGS_FILE),
      {
        recursive: true
      }
    );

    fs.writeFileSync(
      SETTINGS_FILE,
      JSON.stringify(settings, null, 2),
      "utf8"
    );

    return true;
  } catch (error) {
    console.error(
      "Failed to save settings:",
      error
    );

    return false;
  }
}

function getDownloadFolder() {
  return loadSettings().downloadFolder;
}

function setDownloadFolder(folder) {
  if (
    typeof folder !== "string" ||
    !folder.trim()
  ) {
    throw new Error(
      "A valid download folder is required."
    );
  }

  const resolved = path.resolve(
    folder.trim()
  );

  fs.mkdirSync(
    resolved,
    {
      recursive: true
    }
  );

  const settings = loadSettings();

  settings.downloadFolder = resolved;

  if (!saveSettings(settings)) {
    throw new Error(
      "Failed to save download folder."
    );
  }

  return resolved;
}


/* =========================================================
   WINDOW
========================================================= */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,

    minWidth: 900,
    minHeight: 600,

    frame: false,

    backgroundColor: "#0b0b0b",

    webPreferences: {
      preload: path.join(
        __dirname,
        "preload.cjs"
      ),

      contextIsolation: true,

      nodeIntegration: false,

      sandbox: false
    }
  });

  /*
   * Browser downloads are intentionally blocked.
   * Downloads go through our native downloader.
   */
  mainWindow.webContents.session.on(
    "will-download",
    (event, item) => {
      console.warn(
        "Blocked renderer/browser download:",
        item.getFilename()
      );

      event.preventDefault();
    }
  );

  if (isDev) {
    mainWindow.loadURL(
      "http://localhost:5173"
    );
  } else {
    mainWindow.loadFile(
      path.join(
        __dirname,
        "../dist/index.html"
      )
    );
  }

  mainWindow.on(
    "closed",
    () => {
      mainWindow = null;
    }
  );
}


/* =========================================================
   TOKEN STORAGE
========================================================= */

function saveToken(token) {
  if (!token) {
    return false;
  }

  try {
    if (
      !safeStorage.isEncryptionAvailable()
    ) {
      console.error(
        "Electron safeStorage is unavailable."
      );

      return false;
    }

    const encrypted =
      safeStorage.encryptString(token);

    fs.mkdirSync(
      path.dirname(TOKEN_FILE),
      {
        recursive: true
      }
    );

    fs.writeFileSync(
      TOKEN_FILE,
      encrypted
    );

    return true;
  } catch (error) {
    console.error(
      "Failed to save GitHub token:",
      error
    );

    return false;
  }
}

function loadToken() {
  try {
    if (
      !fs.existsSync(TOKEN_FILE)
    ) {
      return null;
    }

    if (
      !safeStorage.isEncryptionAvailable()
    ) {
      return null;
    }

    const encrypted =
      fs.readFileSync(TOKEN_FILE);

    return safeStorage.decryptString(
      encrypted
    );
  } catch (error) {
    console.error(
      "Failed to load GitHub token:",
      error
    );

    return null;
  }
}

function deleteToken() {
  try {
    if (
      fs.existsSync(TOKEN_FILE)
    ) {
      fs.unlinkSync(TOKEN_FILE);
    }

    return true;
  } catch (error) {
    console.error(
      "Failed to delete GitHub token:",
      error
    );

    return false;
  }
}


/* =========================================================
   GITHUB API
========================================================= */

async function githubRequest(
  url,
  token = null,
  options = {}
) {
  const headers = {
    Accept:
      "application/vnd.github+json",

    "X-GitHub-Api-Version":
      "2022-11-28",

    "User-Agent":
      "GitHub-Store",

    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization =
      `Bearer ${token}`;
  }

  const response = await fetch(
    url,
    {
      ...options,
      headers
    }
  );

  const text =
    await response.text();

  let data;

  try {
    data = text
      ? JSON.parse(text)
      : {};
  } catch {
    data = {
      message: text
    };
  }

  if (!response.ok) {
    throw new Error(
      data.message ||
        `GitHub API error ${response.status}`
    );
  }

  return data;
}

async function getGithubUser(token) {
  return githubRequest(
    "https://api.github.com/user",
    token
  );
}


/* =========================================================
   PKCE
========================================================= */

function generatePKCE() {
  const verifier =
    crypto
      .randomBytes(32)
      .toString("base64url");

  const challenge =
    crypto
      .createHash("sha256")
      .update(verifier)
      .digest("base64url");

  return {
    verifier,
    challenge
  };
}


/* =========================================================
   AUTH SERVER
========================================================= */

function closeAuthServer() {
  if (authTimeout) {
    clearTimeout(authTimeout);
    authTimeout = null;
  }

  if (authServer) {
    try {
      authServer.close();
    } catch {
      // Already closed.
    }

    authServer = null;
  }
}

function startAuthServer() {
  return new Promise(
    (resolve, reject) => {
      closeAuthServer();

      let resolveCallback;

      const callbackPromise =
        new Promise(
          callbackResolve => {
            resolveCallback =
              callbackResolve;
          }
        );

      authServer =
        http.createServer(
          (req, res) => {
            let requestUrl;

            try {
              requestUrl =
                new URL(
                  req.url,
                  `http://127.0.0.1:${AUTH_PORT}`
                );
            } catch {
              res.writeHead(400);
              res.end(
                "Invalid request."
              );
              return;
            }

            if (
              requestUrl.pathname !==
              "/callback"
            ) {
              res.writeHead(404);
              res.end("Not found.");
              return;
            }

            const code =
              requestUrl.searchParams.get(
                "code"
              );

            const error =
              requestUrl.searchParams.get(
                "error"
              );

            const errorDescription =
              requestUrl.searchParams.get(
                "error_description"
              );

            res.writeHead(
              200,
              {
                "Content-Type":
                  "text/html; charset=utf-8"
              }
            );

            if (code) {
              res.end(`
                <!DOCTYPE html>
                <html>
                  <head>
                    <meta charset="UTF-8">
                    <title>GitHub Store</title>
                  </head>

                  <body style="
                    margin:0;
                    min-height:100vh;
                    display:grid;
                    place-items:center;
                    background:#0b0b0b;
                    color:white;
                    font-family:system-ui;
                    text-align:center;
                  ">
                    <div>
                      <div style="font-size:64px">
                        🐙
                      </div>

                      <h1>
                        GitHub connected!
                      </h1>

                      <p style="color:#888">
                        You can close this tab.
                      </p>
                    </div>
                  </body>
                </html>
              `);

              resolveCallback({
                code
              });

              return;
            }

            res.end(`
              <!DOCTYPE html>
              <html>
                <body style="
                  margin:0;
                  min-height:100vh;
                  display:grid;
                  place-items:center;
                  background:#0b0b0b;
                  color:white;
                  font-family:system-ui;
                  text-align:center;
                ">
                  <div>
                    <h1>
                      GitHub authorization failed
                    </h1>

                    <p style="color:#888">
                      ${
                        errorDescription ||
                        error ||
                        "Unknown error."
                      }
                    </p>

                    <p style="color:#666">
                      You can close this tab.
                    </p>
                  </div>
                </body>
              </html>
            `);

            resolveCallback({
              error:
                errorDescription ||
                error ||
                "GitHub authorization failed."
            });
          }
        );

      authServer.once(
        "error",
        reject
      );

      authServer.listen(
        AUTH_PORT,
        "127.0.0.1",
        () => {
          console.log(
            `GitHub OAuth server running at ${REDIRECT_URI}`
          );

          resolve({
            callbackPromise
          });
        }
      );
    }
  );
}


/* =========================================================
   TOKEN EXCHANGE
========================================================= */

async function exchangeCode(
  code,
  verifier
) {
  if (!GITHUB_CLIENT_ID) {
    throw new Error(
      "GITHUB_CLIENT_ID is missing from .env"
    );
  }

  if (!GITHUB_CLIENT_SECRET) {
    throw new Error(
      "GITHUB_CLIENT_SECRET is missing from .env"
    );
  }

  const response =
    await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",

        headers: {
          Accept:
            "application/json",

          "Content-Type":
            "application/json",

          "User-Agent":
            "GitHub-Store"
        },

        body:
          JSON.stringify({
            client_id:
              GITHUB_CLIENT_ID,

            client_secret:
              GITHUB_CLIENT_SECRET,

            code,

            redirect_uri:
              REDIRECT_URI,

            code_verifier:
              verifier
          })
      }
    );

  const data =
    await response.json();

  if (
    !response.ok ||
    data.error ||
    !data.access_token
  ) {
    throw new Error(
      data.error_description ||
        data.error ||
        "GitHub token exchange failed."
    );
  }

  return data.access_token;
}


/* =========================================================
   GITHUB LOGIN
========================================================= */

async function startGithubAuth() {
  if (!GITHUB_CLIENT_ID) {
    throw new Error(
      "GITHUB_CLIENT_ID is missing from .env"
    );
  }

  if (!GITHUB_CLIENT_SECRET) {
    throw new Error(
      "GITHUB_CLIENT_SECRET is missing from .env"
    );
  }

  const pkce =
    generatePKCE();

  const server =
    await startAuthServer();

  const params =
    new URLSearchParams({
      client_id:
        GITHUB_CLIENT_ID,

      redirect_uri:
        REDIRECT_URI,

      scope:
        "repo",

      code_challenge:
        pkce.challenge,

      code_challenge_method:
        "S256"
    });

  const githubUrl =
    `https://github.com/login/oauth/authorize?${params}`;

  console.log(
    "======================================"
  );

  console.log(
    "GitHub OAuth authorization starting"
  );

  console.log(
    "Requested OAuth scope: repo"
  );

  console.log(
    `Redirect URI: ${REDIRECT_URI}`
  );

  console.log(
    "======================================"
  );

  await shell.openExternal(
    githubUrl
  );

  authTimeout =
    setTimeout(
      () => {
        closeAuthServer();

        if (mainWindow) {
          mainWindow.webContents.send(
            "github-auth-error",
            "GitHub login timed out."
          );
        }
      },
      5 * 60 * 1000
    );

  const callback =
    await server.callbackPromise;

  if (callback.error) {
    closeAuthServer();

    throw new Error(
      callback.error
    );
  }

  const token =
    await exchangeCode(
      callback.code,
      pkce.verifier
    );

  if (!saveToken(token)) {
    closeAuthServer();

    throw new Error(
      "Could not securely save GitHub token."
    );
  }

  const user =
    await getGithubUser(token);

  closeAuthServer();

  if (mainWindow) {
    mainWindow.webContents.send(
      "github-authenticated",
      user
    );
  }

  return user;
}


/* =========================================================
   REPOSITORIES
========================================================= */

async function getRepositories() {
  const token =
    loadToken();

  if (!token) {
    throw new Error(
      "You are not connected to GitHub."
    );
  }

  return githubRequest(
    "https://api.github.com/user/repos?per_page=100&sort=updated",
    token
  );
}


/* =========================================================
   RELEASES
========================================================= */

async function getGithubReleases(
  owner,
  repo
) {
  const token =
    loadToken();

  if (!token) {
    throw new Error(
      "You are not connected to GitHub."
    );
  }

  owner =
    String(owner || "").trim();

  repo =
    String(repo || "")
      .trim()
      .replace(/\.git$/, "");

  if (!owner) {
    throw new Error(
      "GitHub repository owner is required."
    );
  }

  if (!repo) {
    throw new Error(
      "GitHub repository name is required."
    );
  }

  const url =
    `https://api.github.com/repos/${encodeURIComponent(
      owner
    )}/${encodeURIComponent(
      repo
    )}/releases?per_page=100`;

  const releases =
    await githubRequest(
      url,
      token
    );

  return Array.isArray(releases)
    ? releases
    : [];
}


/* =========================================================
   REPOSITORY PARSING
========================================================= */

function parseGithubRepository(value) {
  if (!value) {
    return null;
  }

  if (
    typeof value === "object" &&
    typeof value.owner === "string" &&
    typeof value.repo === "string"
  ) {
    return {
      owner:
        value.owner.trim(),

      repo:
        value.repo
          .trim()
          .replace(/\.git$/, "")
    };
  }

  if (
    typeof value === "object"
  ) {
    if (
      value.owner &&
      typeof value.owner === "object"
    ) {
      const nested =
        parseGithubRepository(
          value.owner
        );

      if (nested) {
        return nested;
      }

      if (
        typeof value.owner.login ===
          "string" &&
        typeof value.name ===
          "string"
      ) {
        return {
          owner:
            value.owner.login.trim(),

          repo:
            value.name
              .trim()
              .replace(/\.git$/, "")
        };
      }
    }

    if (
      typeof value.repositoryOwner ===
        "string" &&
      typeof value.repositoryName ===
        "string"
    ) {
      return {
        owner:
          value.repositoryOwner.trim(),

        repo:
          value.repositoryName
            .trim()
            .replace(/\.git$/, "")
      };
    }

    if (
      typeof value.ownerLogin ===
        "string" &&
      typeof value.name ===
        "string"
    ) {
      return {
        owner:
          value.ownerLogin.trim(),

        repo:
          value.name
            .trim()
            .replace(/\.git$/, "")
      };
    }

    if (
      typeof value.full_name ===
        "string"
    ) {
      return parseGithubRepository(
        value.full_name
      );
    }

    if (
      typeof value.fullName ===
        "string"
    ) {
      return parseGithubRepository(
        value.fullName
      );
    }

    const objectValues = [
      value.repository,
      value.repoUrl,
      value.repositoryUrl,
      value.html_url,
      value.url
    ];

    for (
      const item of objectValues
    ) {
      const parsed =
        parseGithubRepository(
          item
        );

      if (parsed) {
        return parsed;
      }
    }
  }

  if (
    typeof value === "string"
  ) {
    const input =
      value.trim();

    if (!input) {
      return null;
    }

    try {
      if (
        input.startsWith("http://") ||
        input.startsWith("https://")
      ) {
        const parsed =
          new URL(input);

        if (
          parsed.hostname
            .toLowerCase() ===
          "github.com"
        ) {
          const parts =
            parsed.pathname
              .split("/")
              .filter(Boolean);

          if (
            parts.length >= 2
          ) {
            return {
              owner:
                parts[0].trim(),

              repo:
                parts[1]
                  .trim()
                  .replace(/\.git$/, "")
            };
          }
        }
      }
    } catch {
      // Continue below.
    }

    const githubMatch =
      input.match(
        /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/?#]+)(?:\/.*)?$/i
      );

    if (githubMatch) {
      return {
        owner:
          githubMatch[1].trim(),

        repo:
          githubMatch[2]
            .trim()
            .replace(/\.git$/, "")
      };
    }

    const sshMatch =
      input.match(
        /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i
      );

    if (sshMatch) {
      return {
        owner:
          sshMatch[1].trim(),

        repo:
          sshMatch[2]
            .trim()
            .replace(/\.git$/, "")
      };
    }

    const slashMatch =
      input.match(
        /^([^/\s]+)\/([^/\s]+)$/
      );

    if (slashMatch) {
      return {
        owner:
          slashMatch[1].trim(),

        repo:
          slashMatch[2]
            .trim()
            .replace(/\.git$/, "")
      };
    }
  }

  return null;
}

function resolveGithubRepository(data) {
  if (!data) {
    return null;
  }

  if (
    typeof data.owner === "string" &&
    typeof data.repo === "string"
  ) {
    return {
      owner:
        data.owner.trim(),

      repo:
        data.repo
          .trim()
          .replace(/\.git$/, "")
    };
  }

  if (
    data.owner &&
    typeof data.owner === "object"
  ) {
    const nested =
      parseGithubRepository(
        data.owner
      );

    if (nested) {
      return nested;
    }
  }

  if (
    data.repository &&
    typeof data.repository === "object"
  ) {
    const repository =
      parseGithubRepository(
        data.repository
      );

    if (repository) {
      return repository;
    }
  }

  if (
    typeof data.repositoryOwner ===
      "string" &&
    typeof data.repositoryName ===
      "string"
  ) {
    return {
      owner:
        data.repositoryOwner.trim(),

      repo:
        data.repositoryName
          .trim()
          .replace(/\.git$/, "")
    };
  }

  if (
    typeof data.ownerLogin ===
      "string" &&
    typeof data.name ===
      "string"
  ) {
    return {
      owner:
        data.ownerLogin.trim(),

      repo:
        data.name
          .trim()
          .replace(/\.git$/, "")
    };
  }

  const possibleValues = [
    data.repository,
    data.repoUrl,
    data.repositoryUrl,
    data.html_url,
    data.url,
    data.full_name,
    data.fullName
  ];

  for (
    const value of possibleValues
  ) {
    const parsed =
      parseGithubRepository(
        value
      );

    if (parsed) {
      return parsed;
    }
  }

  return parseGithubRepository(data);
}


/* =========================================================
   APP.JSON
========================================================= */

function normalizeStoreApp(
  appData,
  repository
) {
  if (!appData?.name) {
    return null;
  }

  return {
    id:
      `${repository.owner.login}/${repository.name}`,

    name:
      appData.name,

    description:
      appData.description ||
      "A GitHub Store app.",

    version:
      appData.version ||
      "1.0.0",

    category:
      appData.category ||
      "Utilities",

    icon:
      appData.icon ||
      "",

    author:
      appData.author ||
      repository.owner.login,

    platform:
      appData.platform ||
      "windows",

    repository:
      appData.repository ||
      repository.html_url,

    repoUrl:
      repository.html_url,

    owner:
      repository.owner.login,

    repo:
      repository.name,

    stars:
      repository.stargazers_count ||
      0,

    forks:
      repository.forks_count ||
      0,

    updatedAt:
      repository.updated_at,

    private:
      repository.private
  };
}

async function getRepositoryAppJson(
  repository,
  token = null
) {
  const owner =
    repository.owner.login;

  const repo =
    repository.name;

  const url =
    `https://api.github.com/repos/${encodeURIComponent(
      owner
    )}/${encodeURIComponent(
      repo
    )}/contents/app.json`;

  try {
    const file =
      await githubRequest(
        url,
        token
      );

    if (
      file.type !== "file" ||
      !file.content
    ) {
      return null;
    }

    const decoded =
      Buffer.from(
        file.content.replace(
          /\s/g,
          ""
        ),
        "base64"
      ).toString("utf8");

    const appData =
      JSON.parse(decoded);

    return normalizeStoreApp(
      appData,
      repository
    );
  } catch {
    return null;
  }
}

async function discoverStoreApps() {
  const token =
    loadToken();

  if (!token) {
    throw new Error(
      "You must connect GitHub before discovering apps."
    );
  }

  const repositories =
    await githubRequest(
      "https://api.github.com/user/repos?per_page=100&sort=updated",
      token
    );

  const repositoryMap =
    new Map();

  for (
    const repository of repositories
  ) {
    if (!repository?.full_name) {
      continue;
    }

    repositoryMap.set(
      repository.full_name,
      repository
    );
  }

  const apps = [];

  for (
    const repository of
      repositoryMap.values()
  ) {
    const app =
      await getRepositoryAppJson(
        repository,
        token
      );

    if (app) {
      apps.push(app);
    }
  }

  apps.sort(
    (a, b) =>
      (b.stars || 0) -
      (a.stars || 0)
  );

  return apps;
}


/* =========================================================
   APP.JSON CREATION
========================================================= */

function validateAppData(appData) {
  if (!appData) {
    throw new Error(
      "App data is required."
    );
  }

  if (
    !appData.name ||
    !String(appData.name).trim()
  ) {
    throw new Error(
      "App name is required."
    );
  }

  if (
    !appData.description ||
    !String(appData.description).trim()
  ) {
    throw new Error(
      "App description is required."
    );
  }

  if (
    !appData.version ||
    !String(appData.version).trim()
  ) {
    throw new Error(
      "App version is required."
    );
  }

  if (
    !appData.category ||
    !String(appData.category).trim()
  ) {
    throw new Error(
      "App category is required."
    );
  }
}

async function createAppJson(
  owner,
  repo,
  appData
) {
  validateAppData(appData);

  const token =
    loadToken();

  if (!token) {
    throw new Error(
      "You are not connected to GitHub."
    );
  }

  const normalizedApp = {
    name:
      String(appData.name).trim(),

    description:
      String(
        appData.description
      ).trim(),

    version:
      String(
        appData.version
      ).trim(),

    category:
      String(
        appData.category
      ).trim(),

    icon:
      appData.icon
        ? String(
            appData.icon
          ).trim()
        : "",

    author:
      appData.author
        ? String(
            appData.author
          ).trim()
        : owner,

    repository:
      appData.repository ||
      `https://github.com/${owner}/${repo}`,

    platform:
      appData.platform ||
      "windows"
  };

  const content =
    JSON.stringify(
      normalizedApp,
      null,
      2
    ) + "\n";

  const encodedContent =
    Buffer.from(
      content,
      "utf8"
    ).toString("base64");

  const apiUrl =
    `https://api.github.com/repos/${encodeURIComponent(
      owner
    )}/${encodeURIComponent(
      repo
    )}/contents/app.json`;

  let existingSha = null;

  try {
    const existing =
      await githubRequest(
        apiUrl,
        token
      );

    existingSha =
      existing.sha || null;
  } catch (error) {
    if (
      !String(error.message)
        .toLowerCase()
        .includes("not found")
    ) {
      throw error;
    }
  }

  const body = {
    message:
      existingSha
        ? "Update app.json"
        : "Add app.json",

    content:
      encodedContent
  };

  if (existingSha) {
    body.sha =
      existingSha;
  }

  const result =
    await githubRequest(
      apiUrl,
      token,
      {
        method: "PUT",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(body)
      }
    );

  return {
    success: true,

    created:
      !existingSha,

    updated:
      !!existingSha,

    path:
      result.content?.path ||
      "app.json",

    sha:
      result.content?.sha ||
      null,

    html_url:
      result.content?.html_url ||
      null
  };
}


/* =========================================================
   DOWNLOAD / INSTALL DETECTION
========================================================= */

function safeFileName(value) {
  return String(value || "")
    .replace(
      /[<>:"/\\|?*\x00-\x1F]/g,
      ""
    )
    .trim();
}

function getAppIdentifiers(appData) {
  const identifiers =
    new Set();

  const add = value => {
    if (
      typeof value !== "string"
    ) {
      return;
    }

    const clean =
      safeFileName(value);

    if (clean) {
      identifiers.add(clean);
    }
  };

  add(appData?.name);
  add(appData?.id);

  if (
    appData?.owner &&
    appData?.repo
  ) {
    add(
      `${appData.owner}-${appData.repo}`
    );

    add(
      `${appData.owner}_${appData.repo}`
    );
  }

  if (appData?.repository) {
    const parsed =
      parseGithubRepository(
        appData.repository
      );

    if (parsed) {
      add(
        `${parsed.owner}-${parsed.repo}`
      );

      add(
        `${parsed.owner}_${parsed.repo}`
      );

      add(parsed.repo);
    }
  }

  return Array.from(
    identifiers
  );
}

function findMatchingInstall(
  folder,
  appData
) {
  if (
    !folder ||
    !fs.existsSync(folder)
  ) {
    return null;
  }

  const identifiers =
    getAppIdentifiers(appData);

  if (!identifiers.length) {
    return null;
  }

  const normalizedIdentifiers =
    identifiers.map(
      value =>
        value
          .toLowerCase()
          .replace(/\s+/g, "")
    );

  function matches(fileName) {
    const normalized =
      fileName
        .toLowerCase()
        .replace(/\s+/g, "");

    return normalizedIdentifiers.some(
      identifier =>
        normalized.includes(
          identifier
        )
    );
  }

  function scan(
    currentFolder,
    depth = 0
  ) {
    if (depth > 3) {
      return null;
    }

    let entries;

    try {
      entries =
        fs.readdirSync(
          currentFolder,
          {
            withFileTypes: true
          }
        );
    } catch {
      return null;
    }

    for (
      const entry of entries
    ) {
      const fullPath =
        path.join(
          currentFolder,
          entry.name
        );

      if (
        matches(entry.name)
      ) {
        return fullPath;
      }

      if (
        entry.isDirectory()
      ) {
        const nested =
          scan(
            fullPath,
            depth + 1
          );

        if (nested) {
          return nested;
        }
      }
    }

    return null;
  }

  return scan(folder);
}

function checkAppInstalled(
  appData
) {
  const folder =
    getDownloadFolder();

  const match =
    findMatchingInstall(
      folder,
      appData
    );

  return {
    installed:
      !!match,

    path:
      match || null,

    folder
  };
}


/* =========================================================
   DOWNLOAD HELPERS
========================================================= */

function getSafeDownloadName(
  value,
  fallback = "download"
) {
  let name =
    String(value || "")
      .trim()
      .replace(
        /[<>:"/\\|?*\x00-\x1F]/g,
        ""
      )
      .replace(
        /[. ]+$/,
        ""
      );

  if (!name) {
    name = fallback;
  }

  return name;
}

function getFileNameFromUrl(url) {
  try {
    const parsed =
      new URL(url);

    const pathname =
      decodeURIComponent(
        parsed.pathname
      );

    const basename =
      path.basename(pathname);

    return getSafeDownloadName(
      basename,
      "download"
    );
  } catch {
    return "download";
  }
}

function getUniquePath(filePath) {
  if (
    !fs.existsSync(filePath)
  ) {
    return filePath;
  }

  const directory =
    path.dirname(filePath);

  const extension =
    path.extname(filePath);

  const base =
    path.basename(
      filePath,
      extension
    );

  let counter = 1;

  while (true) {
    const candidate =
      path.join(
        directory,
        `${base} (${counter})${extension}`
      );

    if (
      !fs.existsSync(candidate)
    ) {
      return candidate;
    }

    counter++;
  }
}

function isAllowedDownloadHost(
  hostname
) {
  const host =
    String(
      hostname || ""
    ).toLowerCase();

  return (
    host === "github.com" ||
    host.endsWith(".github.com") ||
    host === "githubusercontent.com" ||
    host.endsWith(
      ".githubusercontent.com"
    ) ||
    host ===
      "objects.githubusercontent.com" ||
    host.endsWith(
      ".objects.githubusercontent.com"
    )
  );
}


/* =========================================================
   DOWNLOAD URL RESOLUTION
========================================================= */

function findDownloadUrl(data) {
  if (!data) {
    return null;
  }

  const candidates = [
    data.browser_download_url,
    data.browserDownloadUrl,
    data.downloadUrl,
    data.download_url,
    data.url,

    data.asset?.browser_download_url,
    data.asset?.browserDownloadUrl,
    data.asset?.downloadUrl,
    data.asset?.download_url,
    data.asset?.url,

    data.releaseAsset?.browser_download_url,
    data.releaseAsset?.browserDownloadUrl,
    data.releaseAsset?.downloadUrl,
    data.releaseAsset?.download_url,
    data.releaseAsset?.url
  ];

  for (
    const candidate of candidates
  ) {
    if (
      typeof candidate === "string" &&
      candidate.trim()
    ) {
      return candidate.trim();
    }
  }

  const assetArrays = [
    data.assets,
    data.release?.assets,
    data.releaseData?.assets
  ];

  for (
    const assets of assetArrays
  ) {
    if (!Array.isArray(assets)) {
      continue;
    }

    const requestedName =
      data.fileName ||
      data.filename ||
      data.assetName ||
      data.asset?.name;

    if (
      typeof requestedName === "string" &&
      requestedName.trim()
    ) {
      const wanted =
        requestedName
          .trim()
          .toLowerCase();

      const matchingAsset =
        assets.find(
          asset =>
            String(
              asset?.name ||
              asset?.filename ||
              ""
            )
              .trim()
              .toLowerCase() ===
            wanted
        );

      if (matchingAsset) {
        const url =
          matchingAsset.browser_download_url ||
          matchingAsset.browserDownloadUrl ||
          matchingAsset.downloadUrl ||
          matchingAsset.download_url ||
          matchingAsset.url;

        if (
          typeof url === "string" &&
          url.trim()
        ) {
          return url.trim();
        }
      }
    }

    if (assets.length === 1) {
      const asset =
        assets[0];

      const url =
        asset?.browser_download_url ||
        asset?.browserDownloadUrl ||
        asset?.downloadUrl ||
        asset?.download_url ||
        asset?.url;

      if (
        typeof url === "string" &&
        url.trim()
      ) {
        return url.trim();
      }
    }
  }

  return null;
}

function findGithubAsset(data) {
  if (!data) {
    return null;
  }

  if (
    data.asset &&
    typeof data.asset === "object"
  ) {
    return data.asset;
  }

  if (
    data.releaseAsset &&
    typeof data.releaseAsset === "object"
  ) {
    return data.releaseAsset;
  }

  const assetLists = [
    data.assets,
    data.release?.assets,
    data.releaseData?.assets
  ];

  const requestedName =
    data.fileName ||
    data.filename ||
    data.assetName ||
    data.name;

  for (
    const assets of assetLists
  ) {
    if (
      !Array.isArray(assets) ||
      !assets.length
    ) {
      continue;
    }

    if (
      typeof requestedName === "string" &&
      requestedName.trim()
    ) {
      const wanted =
        requestedName
          .trim()
          .toLowerCase();

      const match =
        assets.find(
          asset =>
            String(
              asset?.name ||
              asset?.filename ||
              ""
            )
              .trim()
              .toLowerCase() ===
            wanted
        );

      if (match) {
        return match;
      }
    }

    if (assets.length === 1) {
      return assets[0];
    }
  }

  return null;
}

async function findReleaseAssetFromGithub(
  data
) {
  const token =
    loadToken();

  if (!token) {
    return null;
  }

  let owner =
    data?.owner ||
    data?.repositoryOwner;

  let repo =
    data?.repo ||
    data?.repositoryName;

  if (
    (!owner || !repo) &&
    data?.repository
  ) {
    const parsed =
      parseGithubRepository(
        data.repository
      );

    if (parsed) {
      owner =
        parsed.owner;

      repo =
        parsed.repo;
    }
  }

  if (
    (!owner || !repo) &&
    data?.repoUrl
  ) {
    const parsed =
      parseGithubRepository(
        data.repoUrl
      );

    if (parsed) {
      owner =
        parsed.owner;

      repo =
        parsed.repo;
    }
  }

  if (
    (!owner || !repo) &&
    data?.repositoryUrl
  ) {
    const parsed =
      parseGithubRepository(
        data.repositoryUrl
      );

    if (parsed) {
      owner =
        parsed.owner;

      repo =
        parsed.repo;
    }
  }

  if (
    (!owner || !repo) &&
    data?.html_url
  ) {
    const parsed =
      parseGithubRepository(
        data.html_url
      );

    if (parsed) {
      owner =
        parsed.owner;

      repo =
        parsed.repo;
    }
  }

  if (
    typeof owner !== "string" ||
    typeof repo !== "string"
  ) {
    return null;
  }

  owner =
    owner.trim();

  repo =
    repo
      .trim()
      .replace(
        /\.git$/,
        ""
      );

  if (!owner || !repo) {
    return null;
  }

  const releaseId =
    data?.releaseId ||
    data?.release?.id ||
    data?.releaseData?.id;

  if (releaseId) {
    try {
      const release =
        await githubRequest(
          `https://api.github.com/repos/${encodeURIComponent(
            owner
          )}/${encodeURIComponent(
            repo
          )}/releases/${encodeURIComponent(
            releaseId
          )}`,
          token
        );

      const asset =
        findGithubAsset({
          ...data,
          assets:
            release.assets
        });

      if (asset) {
        return asset;
      }
    } catch (error) {
      console.warn(
        "Release ID lookup failed:",
        error.message
      );
    }
  }

  const tagName =
    data?.tag_name ||
    data?.tagName ||
    data?.release?.tag_name ||
    data?.release?.tagName ||
    data?.releaseData?.tag_name;

  if (
    typeof tagName === "string" &&
    tagName.trim()
  ) {
    try {
      const release =
        await githubRequest(
          `https://api.github.com/repos/${encodeURIComponent(
            owner
          )}/${encodeURIComponent(
            repo
          )}/releases/tags/${encodeURIComponent(
            tagName.trim()
          )}`,
          token
        );

      const asset =
        findGithubAsset({
          ...data,
          assets:
            release.assets
        });

      if (asset) {
        return asset;
      }
    } catch (error) {
      console.warn(
        "Release tag lookup failed:",
        error.message
      );
    }
  }

  try {
    const releases =
      await githubRequest(
        `https://api.github.com/repos/${encodeURIComponent(
          owner
        )}/${encodeURIComponent(
          repo
        )}/releases?per_page=100`,
        token
      );

    if (
      Array.isArray(releases)
    ) {
      const wantedName =
        data?.fileName ||
        data?.filename ||
        data?.assetName ||
        data?.asset?.name;

      let release = null;

      if (
        typeof tagName === "string" &&
        tagName.trim()
      ) {
        const wantedTag =
          tagName
            .trim()
            .toLowerCase();

        release =
          releases.find(
            item =>
              String(
                item?.tag_name ||
                ""
              )
                .trim()
                .toLowerCase() ===
              wantedTag
          );
      }

      /*
       * If we know the asset name, search all releases
       * for it instead of blindly grabbing the newest one.
       */
      if (
        !release &&
        typeof wantedName === "string" &&
        wantedName.trim()
      ) {
        const wanted =
          wantedName
            .trim()
            .toLowerCase();

        for (
          const candidate of releases
        ) {
          const asset =
            candidate?.assets?.find(
              item =>
                String(
                  item?.name ||
                  ""
                )
                  .trim()
                  .toLowerCase() ===
                wanted
            );

          if (asset) {
            return asset;
          }
        }
      }

      if (!release) {
        release =
          releases.find(
            item =>
              Array.isArray(
                item?.assets
              ) &&
              item.assets.length
          );
      }

      if (release) {
        const asset =
          findGithubAsset({
            ...data,
            assets:
              release.assets
          });

        if (asset) {
          return asset;
        }
      }
    }
  } catch (error) {
    console.warn(
      "GitHub release lookup failed:",
      error.message
    );
  }

  return null;
}


/* =========================================================
   NATIVE DOWNLOAD
========================================================= */

function downloadFileWithRedirects(
  url,
  destination,
  token,
  onProgress
) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      let finished = false;

      function fail(error) {
        if (finished) {
          return;
        }

        finished = true;

        reject(error);
      }

      function requestUrl(
        currentUrl,
        redirectCount = 0
      ) {
        if (
          redirectCount > 10
        ) {
          fail(
            new Error(
              "Too many download redirects."
            )
          );

          return;
        }

        let parsedUrl;

        try {
          parsedUrl =
            new URL(currentUrl);
        } catch {
          fail(
            new Error(
              "Invalid download URL."
            )
          );

          return;
        }

        if (
          parsedUrl.protocol !==
          "https:"
        ) {
          fail(
            new Error(
              "Downloads must use HTTPS."
            )
          );

          return;
        }

        if (
          !isAllowedDownloadHost(
            parsedUrl.hostname
          )
        ) {
          fail(
            new Error(
              `Download redirected to unsupported host: ${parsedUrl.hostname}`
            )
          );

          return;
        }

        const headers = {
          "User-Agent":
            "GitHub-Store",

          Accept:
            "application/octet-stream"
        };

        /*
         * Do not send the GitHub token to random hosts.
         */
        const hostname =
          parsedUrl.hostname
            .toLowerCase();

        if (
          token &&
          (
            hostname === "github.com" ||
            hostname.endsWith(
              ".github.com"
            ) ||
            hostname ===
              "githubusercontent.com" ||
            hostname.endsWith(
              ".githubusercontent.com"
            )
          )
        ) {
          headers.Authorization =
            `Bearer ${token}`;
        }

        const request =
          https.get(
            parsedUrl,
            {
              headers
            },
            response => {
              const status =
                response.statusCode ||
                0;

              if (
                status >= 300 &&
                status < 400 &&
                response.headers.location
              ) {
                response.resume();

                let redirectUrl;

                try {
                  redirectUrl =
                    new URL(
                      response.headers.location,
                      currentUrl
                    ).toString();
                } catch {
                  fail(
                    new Error(
                      "GitHub returned an invalid redirect URL."
                    )
                  );

                  return;
                }

                requestUrl(
                  redirectUrl,
                  redirectCount + 1
                );

                return;
              }

              if (
                status < 200 ||
                status >= 300
              ) {
                response.resume();

                fail(
                  new Error(
                    `Download failed with HTTP ${status}.`
                  )
                );

                return;
              }

              const total =
                Number(
                  response.headers[
                    "content-length"
                  ]
                ) || 0;

              let received = 0;

              const output =
                fs.createWriteStream(
                  destination
                );

              output.on(
                "error",
                error => {
                  response.destroy();

                  fail(error);
                }
              );

              response.on(
                "error",
                error => {
                  output.destroy();

                  fail(error);
                }
              );

              response.on(
                "data",
                chunk => {
                  received +=
                    chunk.length;

                  if (
                    typeof onProgress ===
                    "function"
                  ) {
                    onProgress({
                      received,

                      total,

                      percent:
                        total > 0
                          ? Math.round(
                              (
                                received /
                                total
                              ) *
                              100
                            )
                          : null
                    });
                  }
                }
              );

              output.on(
                "finish",
                () => {
                  if (finished) {
                    return;
                  }

                  finished = true;

                  resolve({
                    path:
                      destination,

                    size:
                      received
                  });
                }
              );

              response.pipe(
                output
              );
            }
          );

        request.on(
          "error",
          fail
        );
      }

      requestUrl(url);
    }
  );
}


/* =========================================================
   DOWNLOAD EXTENSION FIX
========================================================= */

function fixDownloadedExtension(
  filePath,
  assetName
) {
  if (
    !filePath ||
    !assetName
  ) {
    return filePath;
  }

  const realExtension =
    path.extname(
      String(assetName)
    );

  if (!realExtension) {
    return filePath;
  }

  const currentExtension =
    path.extname(filePath);

  const genericExtensions = [
    ".file",
    ".download",
    ".tmp",
    ".bin"
  ];

  if (
    !genericExtensions.includes(
      currentExtension.toLowerCase()
    )
  ) {
    return filePath;
  }

  const directory =
    path.dirname(filePath);

  const base =
    path.basename(
      filePath,
      currentExtension
    );

  const correctedPath =
    path.join(
      directory,
      `${base}${realExtension}`
    );

  try {
    if (
      fs.existsSync(filePath)
    ) {
      fs.renameSync(
        filePath,
        correctedPath
      );
    }

    return correctedPath;
  } catch (error) {
    console.error(
      "Failed to fix downloaded extension:",
      error
    );

    return filePath;
  }
}


/* =========================================================
   NATIVE RELEASE DOWNLOAD
========================================================= */

async function downloadReleaseAsset(
  data,
  event
) {
  if (!data) {
    throw new Error(
      "Download information is required."
    );
  }

  console.log(
    "======================================"
  );

  console.log(
    "NATIVE GITHUB DOWNLOAD REQUEST"
  );

  console.log(
    JSON.stringify(
      data,
      null,
      2
    )
  );

  console.log(
    "======================================"
  );

  /*
   * First try to get a URL directly from the
   * object the renderer sent.
   */
  let url =
    findDownloadUrl(data);

  /*
   * If there isn't one, resolve the actual
   * GitHub release asset through the API.
   */
  let githubAsset = null;

  if (!url) {
    console.log(
      "No direct download URL found."
    );

    console.log(
      "Looking up GitHub release asset..."
    );

    githubAsset =
      await findReleaseAssetFromGithub(
        data
      );

    if (githubAsset) {
      url =
        githubAsset.browser_download_url ||
        githubAsset.browserDownloadUrl ||
        githubAsset.downloadUrl ||
        githubAsset.download_url ||
        githubAsset.url ||
        null;

      console.log(
        "GitHub asset found:",
        githubAsset.name
      );

      console.log(
        "GitHub asset URL:",
        url
      );
    }
  }

  if (!url) {
    throw new Error(
      "No download URL was provided and no GitHub release asset could be found."
    );
  }

  url =
    String(url).trim();

  let parsedUrl;

  try {
    parsedUrl =
      new URL(url);
  } catch {
    throw new Error(
      "The download URL is invalid."
    );
  }

  if (
    parsedUrl.protocol !==
    "https:"
  ) {
    throw new Error(
      "Downloads must use HTTPS."
    );
  }

  if (
    !isAllowedDownloadHost(
      parsedUrl.hostname
    )
  ) {
    throw new Error(
      "Downloads are only supported from GitHub."
    );
  }

  const token =
    loadToken();

  const downloadFolder =
    getDownloadFolder();

  fs.mkdirSync(
    downloadFolder,
    {
      recursive: true
    }
  );

  /*
   * THIS is the important filename fix.
   *
   * GitHub asset.name should be something like:
   *
   * MyApp.exe
   *
   * instead of relying on the redirected URL,
   * which may look like a random GitHub object URL.
   */
  const assetName =
    githubAsset?.name ||
    data?.asset?.name ||
    data?.releaseAsset?.name ||
    data?.fileName ||
    data?.filename ||
    data?.assetName ||
    getFileNameFromUrl(url);

  let fileName =
    getSafeDownloadName(
      assetName,
      "download"
    );

  /*
   * Correct generic extensions such as .file.
   */
  const realExtension =
    path.extname(
      String(assetName)
    );

  const currentExtension =
    path.extname(fileName);

  const genericExtensions = [
    ".file",
    ".download",
    ".tmp",
    ".bin"
  ];

  if (
    realExtension &&
    genericExtensions.includes(
      currentExtension.toLowerCase()
    )
  ) {
    fileName =
      fileName.slice(
        0,
        fileName.length -
          currentExtension.length
      ) +
      realExtension;
  }

  /*
   * If there is no extension but the asset has one,
   * add it.
   */
  if (
    !path.extname(fileName) &&
    realExtension
  ) {
    fileName +=
      realExtension;
  }

  const initialPath =
    path.join(
      downloadFolder,
      fileName
    );

  const finalPath =
    getUniquePath(
      initialPath
    );

  console.log(
    "======================================"
  );

  console.log(
    "FINAL DOWNLOAD"
  );

  console.log(
    "URL:",
    url
  );

  console.log(
    "Asset name:",
    assetName
  );

  console.log(
    "Folder:",
    downloadFolder
  );

  console.log(
    "File:",
    finalPath
  );

  console.log(
    "======================================"
  );

  function sendProgress(
    progress
  ) {
    try {
      event.sender.send(
        "github-download-progress",
        {
          ...progress,

          path:
            finalPath,

          fileName:
            path.basename(
              finalPath
            ),

          folder:
            downloadFolder
        }
      );
    } catch {
      // Renderer closed.
    }
  }

  sendProgress({
    received: 0,

    total: 0,

    percent: 0,

    complete: false,

    path:
      finalPath,

    fileName:
      path.basename(
        finalPath
      ),

    folder:
      downloadFolder
  });

  try {
    const result =
      await downloadFileWithRedirects(
        url,
        finalPath,
        token,
        sendProgress
      );

    const correctedPath =
      fixDownloadedExtension(
        result.path,
        assetName
      );

    const correctedFileName =
      path.basename(
        correctedPath
      );

    sendProgress({
      received:
        result.size,

      total:
        result.size,

      percent: 100,

      complete: true,

      path:
        correctedPath,

      fileName:
        correctedFileName,

      folder:
        downloadFolder
    });

    console.log(
      "Download complete:",
      correctedPath
    );

    return {
      success: true,

      canceled: false,

      path:
        correctedPath,

      fileName:
        correctedFileName,

      size:
        result.size,

      folder:
        downloadFolder,

      url,

      assetName
    };
  } catch (error) {
    try {
      if (
        fs.existsSync(
          finalPath
        )
      ) {
        fs.unlinkSync(
          finalPath
        );
      }
    } catch (cleanupError) {
      console.error(
        "Failed to clean partial download:",
        cleanupError
      );
    }

    throw error;
  }
}


/* =========================================================
   IPC - DOWNLOAD FOLDER
========================================================= */

ipcMain.handle(
  "github-choose-download-folder",
  async () => {
    try {
      const currentFolder =
        getDownloadFolder();

      const result =
        await dialog.showOpenDialog(
          mainWindow,
          {
            title:
              "Choose GitHub Store Download Folder",

            defaultPath:
              currentFolder,

            properties: [
              "openDirectory",
              "createDirectory"
            ]
          }
        );

      if (
        result.canceled ||
        !result.filePaths?.length
      ) {
        return {
          success: false,

          canceled: true,

          folder:
            currentFolder
        };
      }

      const folder =
        setDownloadFolder(
          result.filePaths[0]
        );

      return {
        success: true,

        canceled: false,

        folder
      };
    } catch (error) {
      console.error(
        "Failed to choose download folder:",
        error
      );

      return {
        success: false,

        canceled: false,

        folder:
          getDownloadFolder(),

        error:
          error?.message ||
          "Failed to choose download folder."
      };
    }
  }
);

ipcMain.handle(
  "github-get-download-folder",
  async () => {
    return {
      success: true,

      folder:
        getDownloadFolder()
    };
  }
);

ipcMain.handle(
  "github-set-download-folder",
  async (
    _event,
    folder
  ) => {
    try {
      const saved =
        setDownloadFolder(
          folder
        );

      return {
        success: true,

        folder:
          saved
      };
    } catch (error) {
      return {
        success: false,

        folder:
          getDownloadFolder(),

        error:
          error?.message ||
          "Failed to set download folder."
      };
    }
  }
);

ipcMain.handle(
  "github-open-download-folder",
  async () => {
    try {
      const folder =
        getDownloadFolder();

      fs.mkdirSync(
        folder,
        {
          recursive: true
        }
      );

      const result =
        await shell.openPath(
          folder
        );

      if (result) {
        throw new Error(result);
      }

      return {
        success: true,

        folder
      };
    } catch (error) {
      return {
        success: false,

        error:
          error?.message ||
          "Failed to open download folder."
      };
    }
  }
);


/* =========================================================
   IPC - NATIVE DOWNLOAD
========================================================= */

ipcMain.handle(
  "github-download-release",
  async (
    event,
    data
  ) => {
    try {
      console.log(
        "======================================"
      );

      console.log(
        "GitHub Store native download:"
      );

      console.log(
        JSON.stringify(
          {
            name:
              data?.name,

            version:
              data?.version,

            fileName:
              data?.fileName,

            filename:
              data?.filename,

            assetName:
              data?.assetName,

            owner:
              data?.owner,

            repo:
              data?.repo,

            tagName:
              data?.tag_name ||
              data?.tagName,

            url:
              data?.url ||
              data?.browser_download_url ||
              data?.downloadUrl ||
              data?.asset?.browser_download_url
          },
          null,
          2
        )
      );

      console.log(
        "======================================"
      );

      return await downloadReleaseAsset(
        data,
        event
      );
    } catch (error) {
      console.error(
        "Native GitHub download failed:",
        error
      );

      return {
        success: false,

        canceled: false,

        error:
          error?.message ||
          "Download failed."
      };
    }
  }
);


/* =========================================================
   IPC - INSTALLED CHECK
========================================================= */

ipcMain.handle(
  "github-check-installed",
  async (
    _event,
    appData
  ) => {
    try {
      return {
        success: true,

        ...checkAppInstalled(
          appData || {}
        )
      };
    } catch (error) {
      console.error(
        "Failed to detect installed app:",
        error
      );

      return {
        success: false,

        installed: false,

        path: null,

        folder:
          getDownloadFolder(),

        error:
          error?.message ||
          "Failed to detect installed app."
      };
    }
  }
);


/* =========================================================
   IPC - AUTH
========================================================= */

ipcMain.handle(
  "github-login",
  async () => {
    try {
      const user =
        await startGithubAuth();

      return {
        success: true,

        user
      };
    } catch (error) {
      console.error(
        "GitHub login failed:",
        error
      );

      closeAuthServer();

      if (mainWindow) {
        mainWindow.webContents.send(
          "github-auth-error",
          error.message
        );
      }

      return {
        success: false,

        error:
          error.message
      };
    }
  }
);

ipcMain.handle(
  "github-get-account",
  async () => {
    const token =
      loadToken();

    if (!token) {
      return null;
    }

    try {
      return await getGithubUser(
        token
      );
    } catch (error) {
      console.error(
        "GitHub account check failed:",
        error
      );

      deleteToken();

      return null;
    }
  }
);

ipcMain.handle(
  "github-logout",
  async () => {
    closeAuthServer();

    deleteToken();

    return {
      success: true
    };
  }
);


/* =========================================================
   IPC - EXTERNAL LINKS
========================================================= */

ipcMain.handle(
  "github-open-external",
  async (
    _event,
    url
  ) => {
    try {
      if (
        typeof url !== "string" ||
        !url.trim()
      ) {
        throw new Error(
          "A valid URL is required."
        );
      }

      const parsedUrl =
        new URL(
          url.trim()
        );

      if (
        parsedUrl.protocol !==
          "https:" &&
        parsedUrl.protocol !==
          "http:"
      ) {
        throw new Error(
          "Only HTTP and HTTPS links can be opened."
        );
      }

      await shell.openExternal(
        parsedUrl.toString()
      );

      return {
        success: true
      };
    } catch (error) {
      console.error(
        "Failed to open external URL:",
        error
      );

      return {
        success: false,

        error:
          error?.message ||
          "Failed to open external link."
      };
    }
  }
);


/* =========================================================
   IPC - REPOSITORIES
========================================================= */

ipcMain.handle(
  "github-get-repositories",
  async () => {
    try {
      return await getRepositories();
    } catch (error) {
      console.error(
        "Failed to get repositories:",
        error
      );

      throw error;
    }
  }
);


/* =========================================================
   IPC - RELEASES
========================================================= */

ipcMain.handle(
  "github-get-releases",
  async (
    _event,
    data
  ) => {
    try {
      if (!data) {
        throw new Error(
          "Repository information is required."
        );
      }

      const repository =
        resolveGithubRepository(
          data
        );

      if (
        !repository?.owner ||
        !repository?.repo
      ) {
        throw new Error(
          "Could not determine the GitHub repository."
        );
      }

      const owner =
        repository.owner.trim();

      const repo =
        repository.repo.trim();

      const releases =
        await getGithubReleases(
          owner,
          repo
        );

      return {
        success: true,

        releases,

        owner,

        repo
      };
    } catch (error) {
      console.error(
        "Failed to get GitHub releases:",
        error
      );

      return {
        success: false,

        releases: [],

        error:
          error?.message ||
          "Failed to load releases."
      };
    }
  }
);


/* =========================================================
   IPC - DISCOVER APPS
========================================================= */

ipcMain.handle(
  "github-discover-apps",
  async () => {
    try {
      const apps =
        await discoverStoreApps();

      return {
        success: true,

        apps
      };
    } catch (error) {
      console.error(
        "Failed to discover apps:",
        error
      );

      return {
        success: false,

        error:
          error?.message ||
          "Failed to discover apps.",

        apps: []
      };
    }
  }
);


/* =========================================================
   IPC - CREATE APP.JSON
========================================================= */

ipcMain.handle(
  "github-create-app-json",
  async (
    _event,
    data
  ) => {
    try {
      if (!data) {
        throw new Error(
          "App data is missing."
        );
      }

      const appData =
        data.app ||
        data;

      const owner =
        typeof data.owner ===
          "string"
          ? data.owner
          : typeof appData.owner ===
              "string"
            ? appData.owner
            : appData.repositoryOwner;

      const repo =
        typeof data.repo ===
          "string"
          ? data.repo
          : typeof appData.repo ===
              "string"
            ? appData.repo
            : appData.repositoryName;

      if (!owner) {
        throw new Error(
          "GitHub repository owner is required."
        );
      }

      if (!repo) {
        throw new Error(
          "GitHub repository name is required."
        );
      }

      const normalizedApp = {
        name:
          appData.name || "",

        description:
          appData.description || "",

        version:
          appData.version ||
          "1.0.0",

        category:
          appData.category ||
          "Utilities",

        icon:
          appData.icon || "",

        author:
          appData.author ||
          owner,

        repository:
          appData.repository ||
          `https://github.com/${owner}/${repo}`,

        platform:
          appData.platform ||
          "windows"
      };

      return await createAppJson(
        owner,
        repo,
        normalizedApp
      );
    } catch (error) {
      console.error(
        "Failed to create app.json:",
        error
      );

      return {
        success: false,

        error:
          error?.message ||
          "Failed to create app.json."
      };
    }
  }
);


/* =========================================================
   WINDOW CONTROLS
========================================================= */

ipcMain.on(
  "window-minimize",
  event => {
    const win =
      BrowserWindow.fromWebContents(
        event.sender
      );

    if (win) {
      win.minimize();
    }
  }
);

ipcMain.on(
  "window-maximize",
  event => {
    const win =
      BrowserWindow.fromWebContents(
        event.sender
      );

    if (!win) {
      return;
    }

    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
);

ipcMain.on(
  "window-close",
  event => {
    const win =
      BrowserWindow.fromWebContents(
        event.sender
      );

    if (win) {
      win.close();
    }
  }
);


/* =========================================================
   LIFECYCLE
========================================================= */

app.whenReady().then(
  () => {
    console.log(
      "GitHub Store userData:",
      app.getPath("userData")
    );

    console.log(
      "GitHub Store download folder:",
      getDownloadFolder()
    );

    console.log(
      "GitHub OAuth redirect:",
      REDIRECT_URI
    );

    createWindow();

    app.on(
      "activate",
      () => {
        if (
          BrowserWindow
            .getAllWindows()
            .length === 0
        ) {
          createWindow();
        }
      }
    );
  }
);

app.on(
  "before-quit",
  () => {
    closeAuthServer();
  }
);

app.on(
  "window-all-closed",
  () => {
    if (
      process.platform !==
      "darwin"
    ) {
      app.quit();
    }
  }
);