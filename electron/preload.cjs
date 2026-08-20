const {
  contextBridge,
  ipcRenderer
} = require("electron");

/* =========================================================
   ELECTRON API
========================================================= */

contextBridge.exposeInMainWorld(
  "electronAPI",
  {
    /* =====================================================
       WINDOW CONTROLS
    ===================================================== */

    minimize: () => {
      ipcRenderer.send("window-minimize");
    },

    maximize: () => {
      ipcRenderer.send("window-maximize");
    },

    close: () => {
      ipcRenderer.send("window-close");
    },

    /* =====================================================
       GITHUB
    ===================================================== */

    github: {
      /* ===================================================
         AUTH
      =================================================== */

      login: () => {
        return ipcRenderer.invoke(
          "github-login"
        );
      },

      logout: () => {
        return ipcRenderer.invoke(
          "github-logout"
        );
      },

      getAccount: () => {
        return ipcRenderer.invoke(
          "github-get-account"
        );
      },

      onAuthenticated: (callback) => {
        if (
          typeof callback !==
          "function"
        ) {
          return () => {};
        }

        const listener =
          (_event, user) => {
            callback(user);
          };

        ipcRenderer.on(
          "github-authenticated",
          listener
        );

        return () => {
          ipcRenderer.removeListener(
            "github-authenticated",
            listener
          );
        };
      },

      onAuthError: (callback) => {
        if (
          typeof callback !==
          "function"
        ) {
          return () => {};
        }

        const listener =
          (_event, error) => {
            callback(error);
          };

        ipcRenderer.on(
          "github-auth-error",
          listener
        );

        return () => {
          ipcRenderer.removeListener(
            "github-auth-error",
            listener
          );
        };
      },

      /* ===================================================
         REPOSITORIES
      =================================================== */

      getRepositories: () => {
        return ipcRenderer.invoke(
          "github-get-repositories"
        );
      },

      /* ===================================================
         APP DISCOVERY
      =================================================== */

      discoverApps: () => {
        return ipcRenderer.invoke(
          "github-discover-apps"
        );
      },

      /* ===================================================
         APP.JSON
      =================================================== */

      createAppJson: (data) => {
        return ipcRenderer.invoke(
          "github-create-app-json",
          data
        );
      },

      /* ===================================================
         RELEASES
      =================================================== */

      getReleases: (
        owner,
        repo
      ) => {
        if (
          typeof owner === "object" &&
          owner !== null &&
          repo === undefined
        ) {
          return ipcRenderer.invoke(
            "github-get-releases",
            owner
          );
        }

        return ipcRenderer.invoke(
          "github-get-releases",
          {
            owner,
            repo
          }
        );
      },

      getRelease: (
        owner,
        repo,
        releaseId
      ) => {
        if (
          typeof owner === "object" &&
          owner !== null
        ) {
          return ipcRenderer.invoke(
            "github-get-release",
            {
              ...owner,
              releaseId: repo
            }
          );
        }

        return ipcRenderer.invoke(
          "github-get-release",
          {
            owner,
            repo,
            releaseId
          }
        );
      },

      /* ===================================================
         NATIVE DOWNLOAD
      =================================================== */

      downloadRelease: (
        owner,
        repo,
        releaseId,
        assetId
      ) => {
        /*
         * Supports:
         *
         * downloadRelease(
         *   "owner",
         *   "repo",
         *   releaseId,
         *   assetId
         * )
         *
         * OR:
         *
         * downloadRelease({
         *   owner,
         *   repo,
         *   releaseId,
         *   assetId
         * })
         */

        if (
          typeof owner === "object" &&
          owner !== null &&
          repo === undefined
        ) {
          return ipcRenderer.invoke(
            "github-download-release",
            owner
          );
        }

        return ipcRenderer.invoke(
          "github-download-release",
          {
            owner,
            repo,
            releaseId,
            assetId
          }
        );
      },

      /*
       * Direct native asset download.
       *
       * This is useful if the renderer already has
       * the GitHub release asset object.
       */
      downloadAsset: (data) => {
        return ipcRenderer.invoke(
          "github-download-release",
          data
        );
      },

      /* ===================================================
         DOWNLOAD PROGRESS
      =================================================== */

      onDownloadProgress: (callback) => {
        if (
          typeof callback !==
          "function"
        ) {
          return () => {};
        }

        const listener =
          (_event, progress) => {
            callback(progress);
          };

        ipcRenderer.on(
          "github-download-progress",
          listener
        );

        return () => {
          ipcRenderer.removeListener(
            "github-download-progress",
            listener
          );
        };
      },

      /* ===================================================
         DOWNLOAD FOLDER
      =================================================== */

      getDownloadFolder: () => {
        return ipcRenderer.invoke(
          "github-get-download-folder"
        );
      },

      chooseDownloadFolder: () => {
        return ipcRenderer.invoke(
          "github-choose-download-folder"
        );
      },

      setDownloadFolder: (
        folder
      ) => {
        return ipcRenderer.invoke(
          "github-set-download-folder",
          folder
        );
      },

      openDownloadFolder: () => {
        return ipcRenderer.invoke(
          "github-open-download-folder"
        );
      },

      /* ===================================================
         INSTALLED CHECK
      =================================================== */

      checkInstalled: (
        appData
      ) => {
        return ipcRenderer.invoke(
          "github-check-installed",
          appData
        );
      },

      /* ===================================================
         OPEN EXTERNAL URL
      =================================================== */

      openExternal: (url) => {
        if (
          typeof url !==
          "string"
        ) {
          return Promise.reject(
            new Error(
              "A valid URL is required."
            )
          );
        }

        const trimmedUrl =
          url.trim();

        if (!trimmedUrl) {
          return Promise.reject(
            new Error(
              "A valid URL is required."
            )
          );
        }

        return ipcRenderer.invoke(
          "github-open-external",
          trimmedUrl
        );
      }
    }
  }
);