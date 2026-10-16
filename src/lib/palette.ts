// Jedna paleta aplikacji: odcienie butelkowej zieleni (od najciemniejszego).
export const GREEN = {
  900: "#0a3326",
  800: "#0b4a37",
  700: "#0b6e4f", // butelkowa zieleń – kolor główny
  600: "#1f8a63",
  500: "#3fa47c",
  400: "#6dbd98",
  300: "#9fd3b8",
  200: "#c8e6d6",
  100: "#e3f2ea",
  50: "#f2f9f5",
} as const;

/** Serie wykresów i kategorie – kolejne odcienie zieleni, kontrastowe względem siebie. */
export const GREEN_SERIES = [GREEN[700], "#c2683c", GREEN[400], GREEN[900], "#e3a582", GREEN[300], GREEN[600], "#9a4a24"];

export const COPPER = "#c2683c";
export const CREAM = "#f5f1e8";

/** Kolory rodzajów elementów mapy. */
export const CATEGORY_GREEN = { source: GREEN[900], page: GREEN[700], action: GREEN[500], offline: COPPER } as const;
