/*
 * App installation metadata.
 *
 * Each app can define the executable names and Windows paths that identify
 * an installed copy. Environment variables such as %LOCALAPPDATA% and
 * %PROGRAMFILES% are resolved by the Electron main process when checking.
 */

export const appMetadata = {
  "jhonnathanboi-sudo/Streamly": {
    id: "jhonnathanboi-sudo/Streamly",
    name: "Streamly",

    install: {
      executableNames: [
        "Streamly.exe"
      ],

      paths: [
        "%LOCALAPPDATA%\\Programs\\Streamly\\Streamly.exe",
        "%LOCALAPPDATA%\\Streamly\\Streamly.exe",
        "%PROGRAMFILES%\\Streamly\\Streamly.exe"
      ]
    }
  }
};

export default appMetadata;
