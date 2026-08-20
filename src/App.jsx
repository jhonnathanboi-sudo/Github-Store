import { useEffect, useMemo, useState } from "react";
import "./index.css";

const featuredApps = [
  {
    id: 1,
    name: "GitHub Store",
    description: "Your home for discovering Windows apps.",
    icon: "",
    category: "Utilities",
    version: "1.0.0",
    platform: "windows",
    author: "GitHub Store",
  },
  {
    id: 2,
    name: "Coming Soon",
    description: "More apps will appear here.",
    icon: "",
    category: "Featured",
    version: "1.0.0",
    platform: "windows",
    author: "GitHub developer",
  },
  {
    id: 3,
    name: "Developer Tools",
    description: "Tools built by developers on GitHub.",
    icon: "",
    category: "Development",
    version: "1.0.0",
    platform: "windows",
    author: "GitHub developer",
  },
];

const categories = [
  "All Apps",
  "Utilities",
  "Development",
  "Games",
  "Media",
  "Productivity",
];

const initialAppForm = {
  name: "",
  description: "",
  version: "1.0.0",
  category: "Utilities",
  icon: "",
  author: "",
  platform: "windows",
};

const CATEGORY_STORAGE_KEY =
  "github-store-default-category";

function App() {
  const [activePage, setActivePage] = useState("home");
  const [search, setSearch] = useState("");
  const [account, setAccount] = useState(null);
  const [showAccount, setShowAccount] = useState(false);

  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const [repositories, setRepositories] = useState([]);
  const [repoLoading, setRepoLoading] = useState(false);
  const [selectedRepository, setSelectedRepository] =
    useState(null);

  const [appForm, setAppForm] =
    useState(initialAppForm);

  const [savedForm, setSavedForm] =
    useState(initialAppForm);

  const [appSaving, setAppSaving] =
    useState(false);

  const [appSaveError, setAppSaveError] =
    useState("");

  const [appSaveSuccess, setAppSaveSuccess] =
    useState("");

  const [editingApp, setEditingApp] =
    useState(false);

  const [selectedApp, setSelectedApp] =
    useState(null);

  const [appReleases, setAppReleases] =
    useState([]);

  const [releasesLoading, setReleasesLoading] =
    useState(false);

  const [releaseError, setReleaseError] =
    useState("");

  const [selectedRelease, setSelectedRelease] =
    useState(null);

  const [storeApps, setStoreApps] =
    useState([]);

  const [storeLoading, setStoreLoading] =
    useState(false);

  const [storeError, setStoreError] =
    useState("");

  const [allFilesEnabled, setAllFilesEnabled] =
    useState(false);

  const [downloadingAssetId, setDownloadingAssetId] =
    useState(null);

  const [downloadingAll, setDownloadingAll] =
    useState(false);

  /*
   * ========================================================
   * CATEGORY SETTINGS
   * ========================================================
   */

  const [selectedCategory, setSelectedCategory] =
    useState(() => {
      try {
        const saved =
          localStorage.getItem(
            CATEGORY_STORAGE_KEY
          );

        if (
          saved &&
          categories.includes(saved)
        ) {
          return saved;
        }
      } catch (error) {
        console.error(
          "Failed to load category setting:",
          error
        );
      }

      return "All Apps";
    });

  useEffect(() => {
    try {
      localStorage.setItem(
        CATEGORY_STORAGE_KEY,
        selectedCategory
      );
    } catch (error) {
      console.error(
        "Failed to save category setting:",
        error
      );
    }
  }, [selectedCategory]);

  const isEditorDirty = useMemo(
    () =>
      JSON.stringify(appForm) !==
      JSON.stringify(savedForm),
    [appForm, savedForm]
  );

  /*
   * ========================================================
   * INITIALIZATION
   * ========================================================
   */

  useEffect(() => {
    if (!window.electronAPI?.github) return;

    window.electronAPI.github
      .getAccount()
      .then((user) => {
        if (user) {
          setAccount(user);

          setAppForm((current) => ({
            ...current,
            author:
              current.author ||
              user.login,
          }));

          setSavedForm((current) => ({
            ...current,
            author:
              current.author ||
              user.login,
          }));
        }
      })
      .catch((error) => {
        console.error(
          "Failed to load GitHub account:",
          error
        );
      });

    const removeAuthenticatedListener =
      window.electronAPI.github.onAuthenticated(
        (user) => {
          setAccount(user);

          setAppForm((current) => ({
            ...current,
            author:
              current.author ||
              user.login,
          }));

          setSavedForm((current) => ({
            ...current,
            author:
              current.author ||
              user.login,
          }));

          setAuthLoading(false);
          setAuthError("");
          setShowAccount(false);
        }
      );

    const removeErrorListener =
      window.electronAPI.github.onAuthError(
        (error) => {
          setAuthLoading(false);
          setAuthError(
            error ||
              "GitHub authentication failed."
          );
        }
      );

    loadStoreApps();

    return () => {
      removeAuthenticatedListener?.();
      removeErrorListener?.();
    };
  }, []);

  /*
   * ========================================================
   * STORE
   * ========================================================
   */

  const loadStoreApps = async () => {
    if (
      !window.electronAPI?.github
        ?.discoverApps
    ) {
      return;
    }

    setStoreLoading(true);
    setStoreError("");

    try {
      const result =
        await window.electronAPI.github.discoverApps();

      if (result?.success) {
        setStoreApps(
          result.apps || []
        );
      } else {
        setStoreApps([]);
        setStoreError(
          result?.error ||
            "Failed to load apps."
        );
      }
    } catch (error) {
      console.error(
        "Failed to load store apps:",
        error
      );

      setStoreApps([]);
      setStoreError(
        error?.message ||
          "Failed to load apps."
      );
    } finally {
      setStoreLoading(false);
    }
  };

  /*
   * ========================================================
   * GITHUB AUTH
   * ========================================================
   */

  const handleGithubLogin = async () => {
    setAuthLoading(true);
    setAuthError("");

    try {
      const result =
        await window.electronAPI.github.login();

      if (!result?.success) {
        setAuthLoading(false);

        setAuthError(
          result?.error ||
            "Could not start GitHub login."
        );
      }
    } catch (error) {
      console.error(error);

      setAuthLoading(false);

      setAuthError(
        error?.message ||
          "Could not connect to GitHub."
      );
    }
  };

  const handleGithubLogout = async () => {
    try {
      await window.electronAPI.github.logout();

      setAccount(null);
      setRepositories([]);
      setSelectedRepository(null);
      setEditingApp(false);
      setShowAccount(false);
    } catch (error) {
      console.error(
        "GitHub logout failed:",
        error
      );
    }
  };

  /*
   * ========================================================
   * REPOSITORIES
   * ========================================================
   */

  const loadRepositories = async () => {
    if (!account) return;

    setRepoLoading(true);

    try {
      const repos =
        await window.electronAPI.github.getRepositories();

      setRepositories(
        Array.isArray(repos)
          ? repos
          : repos?.repositories || []
      );
    } catch (error) {
      console.error(
        "Failed to load repositories:",
        error
      );

      setRepositories([]);
    } finally {
      setRepoLoading(false);
    }
  };

  /*
   * ========================================================
   * ICONS
   * ========================================================
   */

  const renderAppIcon = (
    icon,
    className = ""
  ) => {
    if (!icon) {
      return (
        <div
          className={`app-icon-fallback ${className}`}
        >
          📦
        </div>
      );
    }

    const iconValue =
      String(icon).trim();

    if (
      !/^https?:\/\//i.test(
        iconValue
      )
    ) {
      return (
        <div
          className={`app-icon-fallback ${className}`}
        >
          {iconValue}
        </div>
      );
    }

    return (
      <img
        src={iconValue}
        alt=""
        className={className}
        loading="lazy"
        onError={(event) => {
          event.currentTarget.style.display =
            "none";

          const fallback =
            event.currentTarget.parentElement?.querySelector(
              ".icon-fallback"
            );

          if (fallback) {
            fallback.style.display =
              "grid";
          }
        }}
      />
    );
  };

  /*
   * ========================================================
   * REPOSITORY INFO
   * ========================================================
   */

  const getRepositoryInfo = (app) => {
    if (!app) {
      return {
        owner: "",
        repo: "",
      };
    }

    let owner =
      app.owner ||
      app.repositoryOwner ||
      app.ownerLogin ||
      app.githubOwner;

    let repo =
      app.repo ||
      app.repositoryName ||
      app.repoName ||
      app.githubRepo;

    const repositoryUrl =
      app.repoUrl ||
      app.repository ||
      app.repositoryUrl ||
      app.githubUrl;

    if (
      (!owner || !repo) &&
      repositoryUrl
    ) {
      try {
        const url =
          new URL(repositoryUrl);

        if (
          url.hostname
            .toLowerCase()
            .includes("github.com")
        ) {
          const parts =
            url.pathname
              .split("/")
              .filter(Boolean);

          if (parts.length >= 2) {
            owner =
              owner ||
              parts[0];

            repo =
              repo ||
              parts[1];
          }
        }
      } catch {
        // Invalid URL.
      }
    }

    if (
      (!owner || !repo) &&
      app.full_name
    ) {
      const parts =
        String(
          app.full_name
        )
          .split("/")
          .filter(Boolean);

      if (parts.length >= 2) {
        owner =
          owner ||
          parts[0];

        repo =
          repo ||
          parts[1];
      }
    }

    owner =
      owner?.toString().trim();

    repo =
      repo?.toString().trim();

    if (repo) {
      repo = repo
        .replace(
          /^https?:\/\/github\.com\//i,
          ""
        )
        .replace(
          /^github\.com\//i,
          ""
        )
        .replace(
          /\.git$/i,
          ""
        )
        .replace(
          /\/+$/,
          ""
        );

      if (
        repo.includes("/")
      ) {
        const parts =
          repo
            .split("/")
            .filter(Boolean);

        if (parts.length >= 2) {
          owner =
            owner ||
            parts[0];

          repo =
            parts[
              parts.length - 1
            ];
        }
      }
    }

    return {
      owner: owner || "",
      repo: repo || "",
    };
  };

  /*
   * ========================================================
   * APP DETAILS
   * ========================================================
   */

  const openApp = async (app) => {
    setSelectedApp(app);
    setSelectedRelease(null);
    setAppReleases([]);
    setReleaseError("");
    setAllFilesEnabled(false);
    setDownloadingAssetId(null);
    setDownloadingAll(false);
    setActivePage("app");

    if (
      !window.electronAPI?.github
        ?.getReleases
    ) {
      return;
    }

    setReleasesLoading(true);

    try {
      const {
        owner,
        repo,
      } =
        getRepositoryInfo(app);

      if (
        !owner ||
        !repo
      ) {
        throw new Error(
          "This app does not have a valid GitHub repository."
        );
      }

      const releases =
        await window.electronAPI.github.getReleases(
          {
            owner,
            repo,
          }
        );

      const releaseList =
        Array.isArray(
          releases
        )
          ? releases
          : releases?.releases ||
            [];

      setAppReleases(
        releaseList
      );

      if (
        releaseList.length >
        0
      ) {
        setSelectedRelease(
          releaseList[0]
        );
      }
    } catch (error) {
      console.error(
        "Failed to load releases:",
        error
      );

      setReleaseError(
        error?.message ||
          "Could not load releases."
      );
    } finally {
      setReleasesLoading(
        false
      );
    }
  };

  const closeAppView = () => {
    setSelectedApp(null);
    setSelectedRelease(null);
    setAppReleases([]);
    setReleaseError("");
    setAllFilesEnabled(false);
    setDownloadingAssetId(null);
    setDownloadingAll(false);
    setActivePage("browse");
  };

  /*
   * ========================================================
   * RELEASE HELPERS
   * ========================================================
   */

  const getReleaseAssets = (
    release
  ) => {
    if (
      !Array.isArray(
        release?.assets
      )
    ) {
      return [];
    }

    return release.assets.filter(
      (asset) =>
        asset &&
        asset.browser_download_url &&
        asset.id
    );
  };

  const getFileExtension = (
    filename
  ) => {
    if (!filename)
      return "FILE";

    const cleanName =
      String(filename)
        .split("?")[0]
        .trim();

    const lastDot =
      cleanName.lastIndexOf(
        "."
      );

    if (
      lastDot === -1 ||
      lastDot ===
        cleanName.length - 1
    ) {
      return "FILE";
    }

    return cleanName
      .slice(lastDot + 1)
      .toUpperCase();
  };

  const formatFileSize = (
    bytes
  ) => {
    const size =
      Number(bytes);

    if (
      !Number.isFinite(
        size
      ) ||
      size <= 0
    ) {
      return "Size unknown";
    }

    if (
      size >=
      1024 *
        1024 *
        1024
    ) {
      return `${(
        size /
        1024 /
        1024 /
        1024
      ).toFixed(2)} GB`;
    }

    if (
      size >=
      1024 *
        1024
    ) {
      return `${(
        size /
        1024 /
        1024
      ).toFixed(1)} MB`;
    }

    if (
      size >= 1024
    ) {
      return `${Math.max(
        1,
        Math.round(
          size / 1024
        )
      )} KB`;
    }

    return `${size} B`;
  };

  const getFileIcon = (
    filename
  ) => {
    const extension =
      getFileExtension(
        filename
      );

    if (
      extension === "EXE"
    )
      return "⚙";

    if (
      extension === "MSI"
    )
      return "▣";

    if (
      [
        "ZIP",
        "RAR",
        "7Z",
        "TAR",
        "GZ",
        "BZ2",
      ].includes(extension)
    ) {
      return "▤";
    }

    if (
      [
        "APK",
        "AAB",
      ].includes(extension)
    ) {
      return "📱";
    }

    if (
      [
        "DMG",
        "PKG",
      ].includes(extension)
    ) {
      return "";
    }

    if (
      [
        "DEB",
        "RPM",
        "APPIMAGE",
      ].includes(extension)
    ) {
      return "🐧";
    }

    if (
      extension === "PDF"
    )
      return "📄";

    if (
      [
        "JSON",
        "YAML",
        "YML",
        "XML",
      ].includes(extension)
    ) {
      return "{}";
    }

    return "📦";
  };

  /*
   * ========================================================
   * DOWNLOAD
   * ========================================================
   */

  const handleDownload = async (
    asset
  ) => {
    if (!asset?.id) {
      console.error(
        "Invalid release asset:",
        asset
      );

      return {
        success: false,
        error:
          "Invalid release asset.",
      };
    }

    if (!selectedApp) {
      console.error(
        "No app selected."
      );

      return {
        success: false,
        error:
          "No app selected.",
      };
    }

    if (!selectedRelease) {
      console.error(
        "No release selected."
      );

      return {
        success: false,
        error:
          "No release selected.",
      };
    }

    const {
      owner,
      repo,
    } =
      getRepositoryInfo(
        selectedApp
      );

    if (
      !owner ||
      !repo
    ) {
      console.error(
        "Could not determine repository:",
        selectedApp
      );

      return {
        success: false,
        error:
          "Could not determine the GitHub repository.",
      };
    }

    if (
      !window.electronAPI?.github
        ?.downloadRelease
    ) {
      console.error(
        "downloadRelease IPC is missing from preload."
      );

      return {
        success: false,
        error:
          "Download support is unavailable. Restart the app after updating Electron.",
      };
    }

    setDownloadingAssetId(
      asset.id
    );

    try {
      console.log(
        "Downloading GitHub release asset:",
        {
          owner,
          repo,
          releaseId:
            selectedRelease.id,
          assetId:
            asset.id,
          name:
            asset.name,
        }
      );

      const result =
        await window.electronAPI.github.downloadRelease(
          owner,
          repo,
          selectedRelease.id,
          asset.id
        );

      if (
        !result?.success
      ) {
        throw new Error(
          result?.error ||
            "Failed to download the file."
        );
      }

      console.log(
        "Download started:",
        result
      );

      return result;
    } catch (error) {
      console.error(
        `Failed to download ${asset.name}:`,
        error
      );

      setReleaseError(
        error?.message ||
          `Failed to download ${asset.name}.`
      );

      return {
        success: false,
        error:
          error?.message ||
          "Download failed.",
      };
    } finally {
      setDownloadingAssetId(
        null
      );
    }
  };

  const handleEnableAll =
    async (release) => {
      const assets =
        getReleaseAssets(
          release
        );

      if (
        assets.length === 0
      ) {
        return;
      }

      if (
        downloadingAll
      ) {
        return;
      }

      setDownloadingAll(
        true
      );

      setAllFilesEnabled(
        false
      );

      setReleaseError("");

      let successful = 0;

      try {
        for (
          const asset of assets
        ) {
          const result =
            await handleDownload(
              asset
            );

          if (
            result?.success
          ) {
            successful++;
          }

          await new Promise(
            (resolve) =>
              setTimeout(
                resolve,
                150
              )
          );
        }

        if (
          successful ===
          assets.length
        ) {
          setAllFilesEnabled(
            true
          );
        }
      } finally {
        setDownloadingAll(
          false
        );
      }
    };

  /*
   * ========================================================
   * NAVIGATION
   * ========================================================
   */

  const handleNav = (
    page
  ) => {
    setActivePage(page);
    setShowAccount(false);

    if (
      page ===
        "developer" &&
      account
    ) {
      loadRepositories();
    }

    if (
      page ===
      "browse"
    ) {
      loadStoreApps();
    }
  };

  /*
   * ========================================================
   * EDITOR
   * ========================================================
   */

  const handleSelectRepository =
    (repository) => {
      const nextForm = {
        ...initialAppForm,

        name:
          repository.name ||
          "",

        description:
          repository.description ||
          "",

        author:
          account?.login ||
          repository.owner?.login ||
          "",

        version:
          "1.0.0",

        category:
          "Utilities",

        icon:
          "",

        platform:
          "windows",
      };

      setSelectedRepository(
        repository
      );

      setEditingApp(
        true
      );

      setAppForm(
        nextForm
      );

      setSavedForm(
        nextForm
      );

      setAppSaveError(
        ""
      );

      setAppSaveSuccess(
        ""
      );
    };

  const handleAppFormChange =
    (event) => {
      const {
        name,
        value,
      } =
        event.target;

      setAppForm(
        (current) => ({
          ...current,
          [name]:
            value,
        })
      );

      setAppSaveError(
        ""
      );

      setAppSaveSuccess(
        ""
      );
    };

  const resetEditor = () => {
    setAppForm(
      savedForm
    );

    setAppSaveError(
      ""
    );

    setAppSaveSuccess(
      ""
    );
  };

  const handleCreateAppJson =
    async () => {
      if (!account) {
        setAppSaveError(
          "Connect your GitHub account first."
        );

        return;
      }

      if (
        !selectedRepository
      ) {
        setAppSaveError(
          "Select a repository first."
        );

        return;
      }

      if (
        !appForm.name.trim()
      ) {
        setAppSaveError(
          "App name is required."
        );

        return;
      }

      if (
        !appForm.description.trim()
      ) {
        setAppSaveError(
          "App description is required."
        );

        return;
      }

      if (
        !appForm.version.trim()
      ) {
        setAppSaveError(
          "App version is required."
        );

        return;
      }

      setAppSaving(
        true
      );

      setAppSaveError(
        ""
      );

      setAppSaveSuccess(
        ""
      );

      try {
        const owner =
          selectedRepository.owner?.login ||
          selectedRepository.owner?.name ||
          selectedRepository.authenticatedOwner;

        const repo =
          selectedRepository.name;

        if (
          !owner ||
          !repo
        ) {
          throw new Error(
            "Could not determine the selected repository."
          );
        }

        const repositoryUrl =
          selectedRepository.html_url ||
          `https://github.com/${owner}/${repo}`;

        const result =
          await window.electronAPI.github.createAppJson(
            {
              owner,
              repo,

              app: {
                name:
                  appForm.name.trim(),

                description:
                  appForm.description.trim(),

                version:
                  appForm.version.trim(),

                category:
                  appForm.category.trim(),

                icon:
                  appForm.icon.trim(),

                author: (
                  appForm.author ||
                  account.login
                ).trim(),

                platform:
                  appForm.platform,

                repository:
                  repositoryUrl,
              },
            }
          );

        if (
          !result?.success
        ) {
          throw new Error(
            result?.error ||
              "GitHub did not create app.json."
          );
        }

        const saved = {
          ...appForm,

          name:
            appForm.name.trim(),

          description:
            appForm.description.trim(),

          version:
            appForm.version.trim(),

          category:
            appForm.category.trim(),

          icon:
            appForm.icon.trim(),

          author: (
            appForm.author ||
            account.login
          ).trim(),
        };

        setAppForm(
          saved
        );

        setSavedForm(
          saved
        );

        setAppSaveSuccess(
          result.created
            ? "app.json created successfully!"
            : "app.json updated successfully!"
        );

        await loadStoreApps();
      } catch (error) {
        console.error(
          "Failed to save app.json:",
          error
        );

        setAppSaveError(
          error?.message ||
            "Failed to save app.json."
        );
      } finally {
        setAppSaving(
          false
        );
      }
    };

  /*
   * ========================================================
   * APP FILTERING
   * ========================================================
   */

  const combinedApps =
    useMemo(
      () =>
        storeApps?.length
          ? storeApps
          : featuredApps,
      [storeApps]
    );

  const filteredApps =
    useMemo(() => {
      const query =
        search
          .toLowerCase()
          .trim();

      return combinedApps.filter(
        (app) => {
          const matchesSearch =
            !query ||
            app.name
              ?.toLowerCase()
              .includes(query) ||
            app.description
              ?.toLowerCase()
              .includes(query) ||
            app.category
              ?.toLowerCase()
              .includes(query) ||
            app.author
              ?.toLowerCase()
              .includes(query);

          const matchesCategory =
            selectedCategory ===
              "All Apps" ||
            app.category
              ?.toLowerCase()
              .trim() ===
              selectedCategory
                .toLowerCase()
                .trim();

          return (
            matchesSearch &&
            matchesCategory
          );
        }
      );
    }, [
      combinedApps,
      search,
      selectedCategory,
    ]);

  /*
   * ========================================================
   * APP CARD
   * ========================================================
   */

  const AppCard = ({
    app,
  }) => (
    <article
      className="app-card"
      key={
        app.id ||
        `${app.owner}/${app.repo}/${app.name}`
      }
    >
      <div className="app-card-top">
        <div className="app-icon">
          {renderAppIcon(
            app.icon,
            "app-card-icon"
          )}

          <div
            className="icon-fallback"
            style={{
              display:
                "none",
            }}
          >
            📦
          </div>
        </div>

        <button
          className="more-button"
          type="button"
        >
          •••
        </button>
      </div>

      <div className="app-card-info">
        <span className="app-category">
          {app.category ||
            "Utilities"}
        </span>

        <h3>
          {app.name}
        </h3>

        <p>
          {app.description ||
            "A GitHub Store app."}
        </p>

        <span className="app-card-meta">
          v
          {app.version ||
            "1.0.0"}{" "}
          •{" "}
          {app.author ||
            app.owner ||
            "GitHub developer"}
        </span>
      </div>

      <button
        className="install-button"
        onClick={() =>
          openApp(app)
        }
      >
        View app
      </button>
    </article>
  );

  /*
   * ========================================================
   * RENDER
   * ========================================================
   */

  return (
    <div className="app">

      {/* TITLE BAR */}

      <header className="titlebar">
        <div className="titlebar-brand">
          <div className="titlebar-logo">
            G
          </div>

          <span>
            GitHub Store
          </span>
        </div>

        <div className="window-controls">
          <button
            className="window-button"
            onClick={() =>
              window.electronAPI?.minimize()
            }
          >
            −
          </button>

          <button
            className="window-button"
            onClick={() =>
              window.electronAPI?.maximize()
            }
          >
            □
          </button>

          <button
            className="window-button close-button"
            onClick={() =>
              window.electronAPI?.close()
            }
          >
            ×
          </button>
        </div>
      </header>

      {/* SIDEBAR */}

      <aside className="sidebar">
        <nav className="sidebar-nav">

          <button
            className={`nav-item ${
              activePage ===
              "home"
                ? "active"
                : ""
            }`}
            onClick={() =>
              handleNav(
                "home"
              )
            }
          >
            <span>
              ⌂
            </span>
            Home
          </button>

          <button
            className={`nav-item ${
              activePage ===
              "browse"
                ? "active"
                : ""
            }`}
            onClick={() =>
              handleNav(
                "browse"
              )
            }
          >
            <span>
              ⌕
            </span>
            Browse
          </button>

          <button
            className={`nav-item ${
              activePage ===
              "popular"
                ? "active"
                : ""
            }`}
            onClick={() =>
              handleNav(
                "popular"
              )
            }
          >
            <span>
              ★
            </span>
            Popular
          </button>

          <button
            className={`nav-item ${
              activePage ===
              "updates"
                ? "active"
                : ""
            }`}
            onClick={() =>
              handleNav(
                "updates"
              )
            }
          >
            <span>
              ↻
            </span>
            Updates
          </button>

          {account && (
            <button
              className={`nav-item ${
                activePage ===
                "developer"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                handleNav(
                  "developer"
                )
              }
            >
              <span>
                ⌘
              </span>
              Developer
            </button>
          )}
        </nav>

        <div className="sidebar-bottom">

          <button
            className={`nav-item ${
              activePage ===
              "settings"
                ? "active"
                : ""
            }`}
            onClick={() =>
              handleNav(
                "settings"
              )
            }
          >
            <span>
              ⚙
            </span>
            Settings
          </button>

          <button
            className="account-sidebar"
            onClick={() => {
              setAuthError(
                ""
              );

              setShowAccount(
                true
              );
            }}
          >
            {account ? (
              <>
                <img
                  className="account-avatar"
                  src={
                    account.avatar_url
                  }
                  alt=""
                />

                <div className="account-info">
                  <strong>
                    {
                      account.login
                    }
                  </strong>

                  <span>
                    GitHub connected
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="account-avatar">
                  ?
                </div>

                <div className="account-info">
                  <strong>
                    Guest
                  </strong>

                  <span>
                    Sign in with
                    GitHub
                  </span>
                </div>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* CONTENT */}

      <main className="content">

        {/* APP PAGE */}

        {activePage ===
          "app" &&
          selectedApp && (
            <section
              className="page-section app-details-page"
              style={{
                paddingBottom:
                  "80px",
              }}
            >
              <button
                className="secondary-button"
                onClick={
                  closeAppView
                }
                style={{
                  marginBottom:
                    "28px",
                }}
              >
                ← Back to Store
              </button>

              <div
                className="app-details-hero"
                style={{
                  display:
                    "grid",
                  gridTemplateColumns:
                    "180px 1fr 280px",
                  gap: "36px",
                  alignItems:
                    "center",
                  padding:
                    "34px 0 44px",
                  borderBottom:
                    "1px solid #202020",
                }}
              >
                <div
                  className="app-details-icon"
                  style={{
                    width:
                      "180px",
                    height:
                      "180px",
                    borderRadius:
                      "28px",
                    background:
                      "#181818",
                    display:
                      "grid",
                    placeItems:
                      "center",
                    overflow:
                      "hidden",
                    fontSize:
                      "82px",
                    border:
                      "1px solid #292929",
                    boxShadow:
                      "0 20px 50px rgba(0,0,0,.35)",
                  }}
                >
                  {renderAppIcon(
                    selectedApp.icon,
                    "app-details-image"
                  )}
                </div>

                <div>
                  <div
                    className="app-category"
                    style={{
                      marginBottom:
                        "10px",
                    }}
                  >
                    {
                      selectedApp.category ||
                      "Utilities"
                    }
                  </div>

                  <h1
                    style={{
                      fontSize:
                        "48px",
                      margin:
                        "0 0 12px",
                      letterSpacing:
                        "-1.5px",
                    }}
                  >
                    {
                      selectedApp.name
                    }
                  </h1>

                  <p
                    style={{
                      fontSize:
                        "18px",
                      color:
                        "#aaa",
                      lineHeight:
                        "1.6",
                      margin:
                        "0 0 18px",
                    }}
                  >
                    {
                      selectedApp.description ||
                      "A GitHub Store application."
                    }
                  </p>

                  <div
                    style={{
                      display:
                        "flex",
                      gap:
                        "18px",
                      flexWrap:
                        "wrap",
                      color:
                        "#777",
                      fontSize:
                        "14px",
                    }}
                  >
                    <span>
                      {
                        selectedApp.author ||
                        selectedApp.owner ||
                        "GitHub developer"
                      }
                    </span>

                    <span>
                      •
                    </span>

                    <span>
                      Version{" "}
                      {
                        selectedApp.version ||
                        "1.0.0"
                      }
                    </span>

                    <span>
                      •
                    </span>

                    <span>
                      {
                        selectedApp.platform ||
                        "Windows"
                      }
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    background:
                      "#151515",
                    border:
                      "1px solid #292929",
                    borderRadius:
                      "16px",
                    padding:
                      "22px",
                  }}
                >
                  <div
                    style={{
                      color:
                        "#777",
                      fontSize:
                        "13px",
                      marginBottom:
                        "8px",
                    }}
                  >
                    GET THIS APP
                  </div>

                  {selectedRelease ? (
                    <button
                      className="primary-button"
                      style={{
                        width:
                          "100%",
                        justifyContent:
                          "center",
                        fontSize:
                          "16px",
                        padding:
                          "14px 18px",
                      }}
                      onClick={async () => {
                        const assets =
                          getReleaseAssets(
                            selectedRelease
                          );

                        if (
                          assets.length ===
                          1
                        ) {
                          await handleDownload(
                            assets[0]
                          );
                        } else if (
                          assets.length >
                          1
                        ) {
                          await handleEnableAll(
                            selectedRelease
                          );
                        }
                      }}
                      disabled={
                        getReleaseAssets(
                          selectedRelease
                        ).length ===
                          0 ||
                        downloadingAll ||
                        downloadingAssetId !==
                          null
                      }
                    >
                      {downloadingAll
                        ? "Downloading..."
                        : getReleaseAssets(
                            selectedRelease
                          ).length ===
                          0
                        ? "No files available"
                        : getReleaseAssets(
                            selectedRelease
                          ).length ===
                          1
                        ? downloadingAssetId
                          ? "Downloading..."
                          : "↓ Download"
                        : "↓ Download all files"}
                    </button>
                  ) : (
                    <button
                      className="primary-button"
                      style={{
                        width:
                          "100%",
                        justifyContent:
                          "center",
                      }}
                      disabled
                    >
                      No release selected
                    </button>
                  )}

                  <p
                    style={{
                      color:
                        "#666",
                      fontSize:
                        "12px",
                      lineHeight:
                        "1.5",
                      margin:
                        "12px 0 0",
                    }}
                  >
                    Downloads are
                    handled by
                    GitHub Store
                    and saved to
                    your configured
                    download folder.
                  </p>
                </div>
              </div>

              <div
                style={{
                  display:
                    "grid",
                  gridTemplateColumns:
                    "1fr 320px",
                  gap:
                    "50px",
                  marginTop:
                    "42px",
                  alignItems:
                    "start",
                }}
              >
                <div>
                  <div className="section-heading">
                    <div>
                      <p className="section-label">
                        ABOUT
                      </p>

                      <h2>
                        About this app
                      </h2>
                    </div>
                  </div>

                  <p
                    style={{
                      color:
                        "#aaa",
                      fontSize:
                        "16px",
                      lineHeight:
                        "1.8",
                      whiteSpace:
                        "pre-wrap",
                    }}
                  >
                    {
                      selectedApp.description ||
                      "No additional description was provided by the developer."
                    }
                  </p>

                  <div
                    style={{
                      marginTop:
                        "40px",
                    }}
                  >
                    <p className="section-label">
                      AVAILABLE DOWNLOADS
                    </p>

                    <h2
                      style={{
                        marginTop:
                          "8px",
                      }}
                    >
                      Choose a release
                    </h2>

                    {releasesLoading && (
                      <div
                        className="empty-state"
                        style={{
                          marginTop:
                            "24px",
                        }}
                      >
                        <div className="empty-icon">
                          ↻
                        </div>

                        <h3>
                          Loading releases
                        </h3>

                        <p>
                          Checking GitHub
                          for available
                          downloads...
                        </p>
                      </div>
                    )}

                    {releaseError && (
                      <div
                        className="auth-error"
                        style={{
                          marginTop:
                            "20px",
                        }}
                      >
                        {releaseError}
                      </div>
                    )}

                    {!releasesLoading &&
                      !releaseError &&
                      appReleases.length ===
                        0 && (
                        <div
                          className="empty-state"
                          style={{
                            marginTop:
                              "24px",
                          }}
                        >
                          <div className="empty-icon">
                            📦
                          </div>

                          <h3>
                            No releases yet
                          </h3>

                          <p>
                            This developer
                            hasn't published
                            a GitHub release
                            for this app.
                          </p>
                        </div>
                      )}

                    <div
                      style={{
                        display:
                          "flex",
                        flexDirection:
                          "column",
                        gap:
                          "10px",
                        marginTop:
                          "20px",
                      }}
                    >
                      {appReleases.map(
                        (
                          release
                        ) => {
                          const assets =
                            getReleaseAssets(
                              release
                            );

                          const active =
                            selectedRelease?.id ===
                            release.id;

                          return (
                            <button
                              key={
                                release.id
                              }
                              onClick={() => {
                                setSelectedRelease(
                                  release
                                );

                                setAllFilesEnabled(
                                  false
                                );

                                setReleaseError(
                                  ""
                                );
                              }}
                              style={{
                                width:
                                  "100%",
                                textAlign:
                                  "left",
                                padding:
                                  "18px 20px",
                                borderRadius:
                                  "12px",
                                border:
                                  active
                                    ? "1px solid #3b82f6"
                                    : "1px solid #292929",
                                background:
                                  active
                                    ? "#171d27"
                                    : "#141414",
                                color:
                                  "#fff",
                                cursor:
                                  "pointer",
                              }}
                            >
                              <div
                                style={{
                                  display:
                                    "flex",
                                  alignItems:
                                    "center",
                                  justifyContent:
                                    "space-between",
                                  gap:
                                    "20px",
                                }}
                              >
                                <div>
                                  <strong
                                    style={{
                                      display:
                                        "block",
                                      fontSize:
                                        "16px",
                                    }}
                                  >
                                    {
                                      release.name ||
                                      release.tag_name ||
                                      "Release"
                                    }
                                  </strong>

                                  <span
                                    style={{
                                      display:
                                        "block",
                                      color:
                                        "#777",
                                      fontSize:
                                        "13px",
                                      marginTop:
                                        "5px",
                                    }}
                                  >
                                    {release.published_at
                                      ? new Date(
                                          release.published_at
                                        ).toLocaleDateString()
                                      : "Release date unavailable"}

                                    {" • "}

                                    {
                                      assets.length
                                    }{" "}
                                    file
                                    {assets.length ===
                                    1
                                      ? ""
                                      : "s"}
                                  </span>
                                </div>

                                <span
                                  style={{
                                    color:
                                      active
                                        ? "#60a5fa"
                                        : "#666",
                                    fontSize:
                                      "20px",
                                  }}
                                >
                                  {active
                                    ? "✓"
                                    : "›"}
                                </span>
                              </div>
                            </button>
                          );
                        }
                      )}
                    </div>
                  </div>
                </div>

                <aside className="release-sidebar">
                  <div className="release-panel">
                    <div className="release-panel-header">
                      <div>
                        <p className="section-label">
                          SELECTED RELEASE
                        </p>

                        <h3>
                          {selectedRelease
                            ? selectedRelease.name ||
                              selectedRelease.tag_name ||
                              "Release"
                            : "No release selected"}
                        </h3>
                      </div>

                      {selectedRelease && (
                        <div className="release-version-badge">
                          {
                            selectedRelease.tag_name ||
                            "Release"
                          }
                        </div>
                      )}
                    </div>

                    {selectedRelease ? (
                      <>
                        <div className="release-meta">
                          <span>
                            📅{" "}
                            {selectedRelease.published_at
                              ? new Date(
                                  selectedRelease.published_at
                                ).toLocaleDateString()
                              : "Unknown date"}
                          </span>

                          <span>
                            📦{" "}
                            {
                              getReleaseAssets(
                                selectedRelease
                              ).length
                            }{" "}
                            files
                          </span>
                        </div>

                        {selectedRelease.body && (
                          <div className="release-description">
                            <p>
                              {selectedRelease.body.slice(
                                0,
                                260
                              )}

                              {selectedRelease.body.length >
                              260
                                ? "..."
                                : ""}
                            </p>
                          </div>
                        )}

                        <div className="release-files-header">
                          <div>
                            <p className="section-label">
                              DOWNLOADS
                            </p>

                            <strong>
                              Available files
                            </strong>
                          </div>

                          {getReleaseAssets(
                            selectedRelease
                          ).length >
                            0 && (
                            <button
                              className="enable-all-button"
                              type="button"
                              onClick={() =>
                                handleEnableAll(
                                  selectedRelease
                                )
                              }
                              disabled={
                                downloadingAll ||
                                downloadingAssetId !==
                                  null
                              }
                            >
                              {downloadingAll
                                ? "Downloading..."
                                : allFilesEnabled
                                ? "✓ All downloaded"
                                : "↓ Download all"}
                            </button>
                          )}
                        </div>

                        <div className="release-file-list">
                          {getReleaseAssets(
                            selectedRelease
                          ).length ===
                          0 ? (
                            <div className="release-no-files">
                              <div className="release-no-files-icon">
                                📦
                              </div>

                              <strong>
                                No files available
                              </strong>

                              <span>
                                This release doesn't
                                contain downloadable
                                assets.
                              </span>
                            </div>
                          ) : (
                            getReleaseAssets(
                              selectedRelease
                            ).map(
                              (
                                asset
                              ) => (
                                <div
                                  className="release-file-card"
                                  key={
                                    asset.id
                                  }
                                >
                                  <div className="release-file-icon">
                                    {getFileIcon(
                                      asset.name
                                    )}
                                  </div>

                                  <div className="release-file-info">
                                    <strong
                                      title={
                                        asset.name
                                      }
                                    >
                                      {
                                        asset.name
                                      }
                                    </strong>

                                    <span>
                                      {getFileExtension(
                                        asset.name
                                      )}
                                      {" • "}
                                      {formatFileSize(
                                        asset.size
                                      )}
                                    </span>
                                  </div>

                                  <button
                                    className="release-file-download"
                                    type="button"
                                    onClick={() =>
                                      handleDownload(
                                        asset
                                      )
                                    }
                                    disabled={
                                      downloadingAll ||
                                      downloadingAssetId !==
                                        null
                                    }
                                  >
                                    {downloadingAssetId ===
                                    asset.id
                                      ? "↻"
                                      : "↓"}
                                  </button>
                                </div>
                              )
                            )
                          )}
                        </div>

                        {getReleaseAssets(
                          selectedRelease
                        ).length >
                          0 && (
                          <button
                            className="release-download-all"
                            type="button"
                            onClick={() =>
                              handleEnableAll(
                                selectedRelease
                              )
                            }
                            disabled={
                              downloadingAll ||
                              downloadingAssetId !==
                                null
                            }
                          >
                            <span>
                              {downloadingAll
                                ? "↻"
                                : "↓"}
                            </span>

                            {downloadingAll
                              ? "Downloading files..."
                              : allFilesEnabled
                              ? "Download all files again"
                              : "Download all files"}

                            <small>
                              {
                                getReleaseAssets(
                                  selectedRelease
                                ).length
                              }{" "}
                              available
                            </small>
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="release-empty-selected">
                        <div>
                          📦
                        </div>

                        <strong>
                          Select a release
                        </strong>

                        <span>
                          Choose a release from
                          the list to see its
                          files and downloads.
                        </span>
                      </div>
                    )}
                  </div>
                </aside>
              </div>
            </section>
          )}

        {/* HOME */}

        {activePage ===
          "home" && (
          <>
            <section className="hero">
              <div className="hero-content">
                <div className="hero-badge">
                  <span>●</span>
                  GITHUB POWERED
                </div>

                <h1>
                  Discover apps
                  <br />
                  built by developers.
                </h1>

                <p>
                  Find Windows apps, games,
                  tools, and more. Every app
                  is powered by GitHub releases.
                </p>

                <div className="hero-actions">
                  <button
                    className="primary-button"
                    onClick={() =>
                      handleNav(
                        "browse"
                      )
                    }
                  >
                    Browse apps
                    <span>
                      →
                    </span>
                  </button>

                  <button
                    className="secondary-button"
                    onClick={() => {
                      setAuthError(
                        ""
                      );

                      setShowAccount(
                        true
                      );
                    }}
                  >
                    {account
                      ? "GitHub connected"
                      : "Connect GitHub"}
                  </button>
                </div>
              </div>

              <div className="hero-decoration">
                <div className="hero-orbit orbit-one" />
                <div className="hero-orbit orbit-two" />

                <div className="hero-github">
                  <span>
                    🐙
                  </span>
                </div>
              </div>
            </section>

            <section className="store-section">
              <div className="section-heading">
                <div>
                  <p className="section-label">
                    DISCOVER
                  </p>

                  <h2>
                    Featured Apps
                  </h2>
                </div>

                <button
                  className="view-all"
                  onClick={() =>
                    handleNav(
                      "browse"
                    )
                  }
                >
                  View all →
                </button>
              </div>

              {storeLoading ? (
                <div className="empty-state">
                  <div className="empty-icon">
                    ↻
                  </div>

                  <h3>
                    Loading apps
                  </h3>

                  <p>
                    Discovering apps from
                    GitHub...
                  </p>
                </div>
              ) : (
                <div className="app-grid">
                  {filteredApps
                    .slice(
                      0,
                      6
                    )
                    .map(
                      (
                        app
                      ) => (
                        <AppCard
                          app={
                            app
                          }
                          key={
                            app.id ||
                            `${app.owner}/${app.repo}/${app.name}`
                          }
                        />
                      )
                    )}
                </div>
              )}
            </section>
          </>
        )}

        {/* BROWSE */}

        {activePage ===
          "browse" && (
          <section className="page-section">
            <div className="page-header">
              <p className="section-label">
                STORE
              </p>

              <h1>
                Browse Apps
              </h1>

              <p>
                Discover Windows apps from
                GitHub developers.
              </p>
            </div>

            <div className="search-container">
              <span>
                ⌕
              </span>

              <input
                value={search}
                onChange={(
                  event
                ) =>
                  setSearch(
                    event
                      .target
                      .value
                  )
                }
                placeholder="Search apps..."
                autoFocus
              />

              {search && (
                <button
                  onClick={() =>
                    setSearch(
                      ""
                    )
                  }
                >
                  ×
                </button>
              )}
            </div>

            <div className="categories">
              {categories.map(
                (
                  category
                ) => (
                  <button
                    className={`category-button ${
                      selectedCategory ===
                      category
                        ? "active"
                        : ""
                    }`}
                    key={
                      category
                    }
                    onClick={() =>
                      setSelectedCategory(
                        category
                      )
                    }
                  >
                    {
                      category
                    }
                  </button>
                )
              )}
            </div>

            {selectedCategory !==
              "All Apps" && (
              <div className="active-filter">
                <span>
                  Showing{" "}
                  <strong>
                    {
                      selectedCategory
                    }
                  </strong>{" "}
                  apps
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setSelectedCategory(
                      "All Apps"
                    )
                  }
                >
                  Clear filter ×
                </button>
              </div>
            )}

            {storeLoading ? (
              <div className="empty-state">
                <div className="empty-icon">
                  ↻
                </div>

                <h3>
                  Loading apps
                </h3>

                <p>
                  Checking GitHub...
                </p>
              </div>
            ) : (
              <div className="app-grid browse-grid">
                {filteredApps.map(
                  (
                    app
                  ) => (
                    <AppCard
                      app={
                        app
                      }
                      key={
                        app.id ||
                        `${app.owner}/${app.repo}/${app.name}`
                      }
                    />
                  )
                )}
              </div>
            )}

            {!storeLoading &&
              filteredApps.length ===
                0 && (
                <div className="empty-state">
                  <div className="empty-icon">
                    ⌕
                  </div>

                  <h3>
                    No apps found
                  </h3>

                  <p>
                    {selectedCategory !==
                    "All Apps"
                      ? `There are no apps in the ${selectedCategory} category yet.`
                      : "Try a different search."}
                  </p>

                  {selectedCategory !==
                    "All Apps" && (
                    <button
                      className="secondary-button"
                      onClick={() =>
                        setSelectedCategory(
                          "All Apps"
                        )
                      }
                    >
                      Show all apps
                    </button>
                  )}
                </div>
              )}
          </section>
        )}

        {/* POPULAR */}

        {activePage ===
          "popular" && (
          <section className="page-section">
            <div className="page-header">
              <p className="section-label">
                TRENDING
              </p>

              <h1>
                Popular Apps
              </h1>

              <p>
                The apps everyone is
                downloading.
              </p>
            </div>

            <div className="app-grid">
              {[...storeApps]
                .sort(
                  (
                    a,
                    b
                  ) =>
                    (b.stars ||
                      0) -
                    (a.stars ||
                      0)
                )
                .slice(
                  0,
                  6
                )
                .map(
                  (
                    app
                  ) => (
                    <AppCard
                      app={
                        app
                      }
                      key={
                        app.id ||
                        `${app.owner}/${app.repo}/${app.name}`
                      }
                    />
                  )
                )}
            </div>

            {storeApps.length ===
              0 && (
              <div className="empty-state large-empty">
                <div className="empty-icon">
                  ★
                </div>

                <h3>
                  Popular apps are
                  coming
                </h3>

                <p>
                  Once the store has
                  enough apps, popular
                  apps will appear here.
                </p>
              </div>
            )}
          </section>
        )}

        {/* UPDATES */}

        {activePage ===
          "updates" && (
          <section className="page-section">
            <div className="page-header">
              <p className="section-label">
                RELEASES
              </p>

              <h1>
                Updates
              </h1>

              <p>
                See what's new across the
                store.
              </p>
            </div>

            <div className="empty-state large-empty">
              <div className="empty-icon">
                ↻
              </div>

              <h3>
                GitHub releases
              </h3>

              <p>
                New releases will appear
                here as developers publish
                updates.
              </p>
            </div>
          </section>
        )}

        {/* DEVELOPER */}

        {activePage ===
          "developer" && (
          <section className="page-section">

            <div className="page-header">
              <p className="section-label">
                DEVELOPER
              </p>

              <h1>
                Developer Dashboard
              </h1>

              <p>
                Create and manage your
                GitHub Store listing.
              </p>
            </div>

            <div className="developer-header">
              <div>
                <h2>
                  Your repositories
                </h2>

                <p>
                  Choose a repository to
                  configure its store listing.
                </p>
              </div>

              <button
                className="primary-button"
                onClick={
                  loadRepositories
                }
                disabled={
                  repoLoading
                }
              >
                {repoLoading
                  ? "Loading..."
                  : "↻ Refresh"}
              </button>
            </div>

            <div className="repository-list">

              {repoLoading && (
                <div className="empty-state">
                  <div className="empty-icon">
                    ↻
                  </div>

                  <h3>
                    Loading repositories
                  </h3>

                  <p>
                    Fetching your GitHub
                    repositories...
                  </p>
                </div>
              )}

              {!repoLoading &&
                repositories.length ===
                  0 && (
                  <div className="empty-state">
                    <div className="empty-icon">
                      📦
                    </div>

                    <h3>
                      No repositories loaded
                    </h3>

                    <p>
                      Click refresh to load
                      your repositories.
                    </p>
                  </div>
                )}

              {!repoLoading &&
                repositories.map(
                  (
                    repo
                  ) => (
                    <div
                      className={`repository-card ${
                        selectedRepository?.id ===
                        repo.id
                          ? "active"
                          : ""
                      }`}
                      key={
                        repo.id
                      }
                    >
                      <div className="repository-icon">
                        {repo.owner?.avatar_url ? (
                          <img
                            src={
                              repo
                                .owner
                                .avatar_url
                            }
                            alt=""
                          />
                        ) : (
                          "📦"
                        )}
                      </div>

                      <div className="repository-info">
                        <h3>
                          {
                            repo.name
                          }
                        </h3>

                        <p>
                          {repo.description ||
                            "No description"}
                        </p>

                        <span>
                          {repo.private
                            ? "Private"
                            : "Public"}{" "}
                          •{" "}
                          {repo.language ||
                            "Unknown"}
                        </span>
                      </div>

                      <button
                        className="install-button repository-button"
                        onClick={() =>
                          handleSelectRepository(
                            repo
                          )
                        }
                      >
                        {selectedRepository?.id ===
                        repo.id
                          ? "Editing"
                          : "Edit"}
                      </button>
                    </div>
                  )
                )}
            </div>

            {editingApp &&
              selectedRepository && (
                <div className="app-editor">

                  <div className="app-editor-topbar">

                    <div className="editor-heading">

                      <div className="editor-heading-icon">
                        ✦
                      </div>

                      <div>
                        <div className="editor-heading-row">
                          <p className="section-label">
                            STORE LISTING
                          </p>

                          {isEditorDirty && (
                            <span className="unsaved-badge">
                              ● Unsaved changes
                            </span>
                          )}
                        </div>

                        <h2>
                          Edit your app
                        </h2>

                        <p>
                          Customize how{" "}
                          <strong>
                            {
                              selectedRepository.name
                            }
                          </strong>{" "}
                          appears in GitHub Store.
                        </p>
                      </div>

                    </div>

                    <div className="editor-top-actions">

                      {isEditorDirty && (
                        <button
                          className="secondary-button"
                          onClick={
                            resetEditor
                          }
                        >
                          Reset
                        </button>
                      )}

                      <button
                        className="secondary-button"
                        onClick={() => {
                          setEditingApp(
                            false
                          );

                          setAppSaveError(
                            ""
                          );

                          setAppSaveSuccess(
                            ""
                          );
                        }}
                      >
                        Close
                      </button>

                    </div>
                  </div>

                  <div className="editor-layout">

                    <div className="editor-preview-column">

                      <div className="editor-section-title">
                        <div>
                          <span>
                            LIVE PREVIEW
                          </span>

                          <small>
                            See exactly what users
                            will see.
                          </small>
                        </div>

                        <span className="preview-live">
                          <i />
                          Live
                        </span>
                      </div>

                      <div className="store-preview-card">

                        <div className="preview-icon-wrap">

                          {appForm.icon ? (
                            <img
                              src={
                                appForm.icon
                              }
                              alt=""
                              className="preview-icon"
                              onError={(
                                event
                              ) => {
                                event.currentTarget.style.display =
                                  "none";

                                const fallback =
                                  event.currentTarget
                                    .parentElement
                                    ?.querySelector(
                                      ".preview-icon-fallback"
                                    );

                                if (
                                  fallback
                                ) {
                                  fallback.style.display =
                                    "grid";
                                }
                              }}
                            />
                          ) : null}

                          <div
                            className="preview-icon-fallback"
                            style={{
                              display:
                                appForm.icon
                                  ? "none"
                                  : "grid",
                            }}
                          >
                            📦
                          </div>

                        </div>

                        <div className="preview-category">
                          {appForm.category ||
                            "Utilities"}
                        </div>

                        <h3>
                          {appForm.name ||
                            "Your App Name"}
                        </h3>

                        <p>
                          {appForm.description ||
                            "Your app description will appear here."}
                        </p>

                        <div className="preview-meta">
                          <span>
                            v
                            {appForm.version ||
                              "1.0.0"}
                          </span>

                          <span>
                            •
                          </span>

                          <span>
                            {appForm.platform ===
                            "windows-x64"
                              ? "Windows x64"
                              : appForm.platform ===
                                "windows-arm64"
                              ? "Windows ARM64"
                              : "Windows"}
                          </span>
                        </div>

                        <button
                          className="install-button"
                          type="button"
                          disabled
                        >
                          View app
                        </button>
                      </div>

                      <div className="preview-stats">

                        <div>
                          <strong>
                            {appForm.version ||
                              "1.0.0"}
                          </strong>

                          <span>
                            Version
                          </span>
                        </div>

                        <div>
                          <strong>
                            {appForm.platform ===
                            "windows-x64"
                              ? "x64"
                              : appForm.platform ===
                                "windows-arm64"
                              ? "ARM64"
                              : "Windows"}
                          </strong>

                          <span>
                            Platform
                          </span>
                        </div>

                        <div>
                          <strong>
                            {appForm.category ||
                              "Utilities"}
                          </strong>

                          <span>
                            Category
                          </span>
                        </div>

                      </div>

                      <div className="preview-repository">

                        <div className="preview-repository-icon">
                          ◆
                        </div>

                        <div>
                          <span>
                            GITHUB REPOSITORY
                          </span>

                          <strong>
                            {selectedRepository.full_name ||
                              `${
                                selectedRepository.owner?.login ||
                                account?.login ||
                                "github"
                              }/${selectedRepository.name}`}
                          </strong>
                        </div>

                        <span className="repo-check">
                          ✓
                        </span>

                      </div>

                    </div>

                    <div className="editor-form-column">

                      <div className="editor-section-title">
                        <div>
                          <span>
                            APP INFORMATION
                          </span>

                          <small>
                            Configure your public
                            store listing.
                          </small>
                        </div>
                      </div>

                      <div className="editor-form">

                        <div className="editor-field">

                          <div className="field-header">
                            <label>
                              App name
                            </label>

                            <span>
                              {
                                appForm.name
                                  .length
                              }
                              /60
                            </span>
                          </div>

                          <input
                            name="name"
                            maxLength={60}
                            value={
                              appForm.name
                            }
                            onChange={
                              handleAppFormChange
                            }
                            placeholder="My Awesome App"
                          />

                          <small>
                            The name users will see
                            in the store.
                          </small>

                        </div>

                        <div className="editor-field">

                          <div className="field-header">
                            <label>
                              Description
                            </label>

                            <span>
                              {
                                appForm
                                  .description
                                  .length
                              }
                              /300
                            </span>
                          </div>

                          <textarea
                            name="description"
                            maxLength={300}
                            value={
                              appForm.description
                            }
                            onChange={
                              handleAppFormChange
                            }
                            placeholder="Tell users what your app does..."
                            rows={6}
                          />

                          <small>
                            Keep it short, clear,
                            and useful.
                          </small>

                        </div>

                        <div className="editor-two-column">

                          <div className="editor-field">

                            <label>
                              Version
                            </label>

                            <input
                              name="version"
                              value={
                                appForm.version
                              }
                              onChange={
                                handleAppFormChange
                              }
                              placeholder="1.0.0"
                            />

                            <small>
                              Example: 1.2.0
                            </small>

                          </div>

                          <div className="editor-field">

                            <label>
                              Category
                            </label>

                            <select
                              name="category"
                              value={
                                appForm.category
                              }
                              onChange={
                                handleAppFormChange
                              }
                            >
                              {categories
                                .filter(
                                  (
                                    category
                                  ) =>
                                    category !==
                                    "All Apps"
                                )
                                .map(
                                  (
                                    category
                                  ) => (
                                    <option
                                      key={
                                        category
                                      }
                                      value={
                                        category
                                      }
                                    >
                                      {
                                        category
                                      }
                                    </option>
                                  )
                                )}
                            </select>

                            <small>
                              Helps users discover
                              your app.
                            </small>

                          </div>

                        </div>

                        <div className="editor-field">

                          <label>
                            App icon
                          </label>

                          <div className="icon-input-row">

                            <div className="mini-icon-preview">

                              {appForm.icon ? (
                                <img
                                  src={
                                    appForm.icon
                                  }
                                  alt=""
                                  onError={(
                                    event
                                  ) => {
                                    event.currentTarget.style.display =
                                      "none";
                                  }}
                                />
                              ) : (
                                "📦"
                              )}

                            </div>

                            <input
                              name="icon"
                              value={
                                appForm.icon
                              }
                              onChange={
                                handleAppFormChange
                              }
                              placeholder="https://example.com/icon.png"
                            />

                          </div>

                          <small>
                            Use a direct HTTPS image
                            URL. PNG, JPG, and WebP
                            work best.
                          </small>

                        </div>

                        <div className="editor-two-column">

                          <div className="editor-field">

                            <label>
                              Platform
                            </label>

                            <select
                              name="platform"
                              value={
                                appForm.platform
                              }
                              onChange={
                                handleAppFormChange
                              }
                            >
                              <option value="windows">
                                Windows
                              </option>

                              <option value="windows-x64">
                                Windows x64
                              </option>

                              <option value="windows-arm64">
                                Windows ARM64
                              </option>
                            </select>

                          </div>

                          <div className="editor-field">

                            <label>
                              Author
                            </label>

                            <input
                              name="author"
                              value={
                                appForm.author
                              }
                              onChange={
                                handleAppFormChange
                              }
                              placeholder={
                                account?.login ||
                                "GitHub username"
                              }
                            />

                          </div>

                        </div>

                        <div className="editor-repository-box">

                          <div className="editor-repository-icon">
                            ◆
                          </div>

                          <div className="editor-repository-content">

                            <span>
                              SOURCE REPOSITORY
                            </span>

                            <strong>
                              {selectedRepository.full_name ||
                                `${
                                  selectedRepository.owner?.login ||
                                  account?.login ||
                                  "github"
                                }/${selectedRepository.name}`}
                            </strong>

                            <small>
                              {selectedRepository.html_url ||
                                `https://github.com/${
                                  selectedRepository.owner?.login ||
                                  account?.login
                                }/${selectedRepository.name}`}
                            </small>

                          </div>

                          <span className="repository-connected">
                            Connected
                          </span>

                        </div>

                        {appSaveError && (
                          <div className="auth-error editor-message">

                            <strong>
                              Couldn't save
                            </strong>

                            <span>
                              {
                                appSaveError
                              }
                            </span>

                          </div>
                        )}

                        {appSaveSuccess && (
                          <div className="auth-success editor-message">

                            <strong>
                              ✓ Saved successfully
                            </strong>

                            <span>
                              {
                                appSaveSuccess
                              }
                            </span>

                          </div>
                        )}

                        <div className="editor-save-area">

                          <div className="save-status">

                            <div className="save-status-icon">
                              {isEditorDirty
                                ? "●"
                                : "✓"}
                            </div>

                            <div>

                              <strong>
                                {isEditorDirty
                                  ? "You have unsaved changes"
                                  : "Everything is saved"}
                              </strong>

                              <span>
                                {isEditorDirty
                                  ? "Save your changes to update app.json."
                                  : "Your store listing matches app.json."}
                              </span>

                            </div>

                          </div>

                          <button
                            className="primary-button"
                            onClick={
                              handleCreateAppJson
                            }
                            disabled={
                              appSaving ||
                              !isEditorDirty
                            }
                          >
                            {appSaving ? (
                              <>
                                <span className="button-spinner">
                                  ↻
                                </span>

                                Saving...
                              </>
                            ) : (
                              <>
                                Save changes

                                <span>
                                  →
                                </span>
                              </>
                            )}
                          </button>

                        </div>

                      </div>
                    </div>
                  </div>

                  <div className="editor-danger-zone">

                    <div>
                      <p className="section-label">
                        GITHUB CONNECTION
                      </p>

                      <h3>
                        Repository connection
                      </h3>

                      <p>
                        Changes are committed
                        directly to{" "}
                        <strong>
                          {
                            selectedRepository.name
                          }
                        </strong>
                        . GitHub remains the
                        source of truth for your
                        store listing.
                      </p>
                    </div>

                    <button
                      className="secondary-button"
                      onClick={() => {
                        setEditingApp(
                          false
                        );

                        setSelectedRepository(
                          null
                        );
                      }}
                    >
                      Close editor
                    </button>

                  </div>

                </div>
              )}

          </section>
        )}

        {/* SETTINGS */}

        {activePage ===
          "settings" && (
          <section className="page-section">

            <div className="page-header">
              <p className="section-label">
                APP
              </p>

              <h1>
                Settings
              </h1>

              <p>
                Manage your GitHub Store
                preferences.
              </p>
            </div>

            <div className="settings-card">

              <div>
                <h3>
                  GitHub Account
                </h3>

                <p>
                  {account
                    ? `Connected as ${account.login}`
                    : "Connect your GitHub account to publish apps."}
                </p>
              </div>

              <button
                className="primary-button"
                onClick={() => {
                  setAuthError(
                    ""
                  );

                  setShowAccount(
                    true
                  );
                }}
              >
                {account
                  ? "Manage account"
                  : "Connect GitHub"}
              </button>

            </div>

            {/* CATEGORY SETTINGS */}

            <div className="settings-card">

              <div>
                <h3>
                  Default app category
                </h3>

                <p>
                  Choose which category is
                  selected by default when you
                  open Browse.
                </p>
              </div>

              <select
                className="settings-select"
                value={
                  selectedCategory
                }
                onChange={(event) =>
                  setSelectedCategory(
                    event.target.value
                  )
                }
              >
                {categories.map(
                  (
                    category
                  ) => (
                    <option
                      key={
                        category
                      }
                      value={
                        category
                      }
                    >
                      {
                        category
                      }
                    </option>
                  )
                )}
              </select>

            </div>

            <div className="settings-card">

              <div>
                <h3>
                  Current store filter
                </h3>

                <p>
                  Browse is currently
                  showing{" "}
                  <strong>
                    {
                      selectedCategory
                    }
                  </strong>
                  .
                </p>
              </div>

              {selectedCategory !==
                "All Apps" && (
                <button
                  className="secondary-button"
                  onClick={() =>
                    setSelectedCategory(
                      "All Apps"
                    )
                  }
                >
                  Reset filter
                </button>
              )}

            </div>

            <div className="settings-card">

              <div>
                <h3>
                  About GitHub Store
                </h3>

                <p>
                  Version 0.1.0
                </p>
              </div>

            </div>

          </section>
        )}

      </main>

      {/* ACCOUNT MODAL */}

      {showAccount && (
        <div
          className="modal-overlay"
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setShowAccount(
                false
              );
            }
          }}
        >
          <div className="account-modal">

            <button
              className="modal-close"
              onClick={() =>
                setShowAccount(
                  false
                )
              }
            >
              ×
            </button>

            {account ? (
              <>
                <img
                  className="connected-avatar"
                  src={
                    account.avatar_url
                  }
                  alt=""
                />

                <h2>
                  {
                    account.login
                  }
                </h2>

                <p>
                  Your GitHub account is
                  connected to GitHub Store.
                </p>

                <button
                  className="github-button danger-button"
                  onClick={
                    handleGithubLogout
                  }
                >
                  Disconnect GitHub
                </button>
              </>
            ) : (
              <>
                <div className="github-modal-icon">
                  🐙
                </div>

                <h2>
                  Connect GitHub
                </h2>

                <p>
                  Connect your GitHub account
                  to publish apps and manage
                  your repositories.
                </p>

                {authError && (
                  <div className="auth-error">
                    {
                      authError
                    }
                  </div>
                )}

                <button
                  className="github-button"
                  onClick={
                    handleGithubLogin
                  }
                  disabled={
                    authLoading
                  }
                >
                  {authLoading
                    ? "Waiting for GitHub..."
                    : "Continue with GitHub"}
                </button>

                <span className="modal-note">
                  You'll authorize GitHub
                  Store through GitHub.
                </span>
              </>
            )}

          </div>
        </div>
      )}

    </div>
  );
}

export default App;