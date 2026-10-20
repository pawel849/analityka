// Jedna paleta aplikacji: odcienie butelkowej zieleni (od najciemniejszego).
export const GREEN = {
  900: "#0f8a5a",
  800: "#12a46a",
  700: "#1fd38a", // szmaragd – kolor główny (ciemny motyw)
  600: "#2ee69a",
  500: "#6fe3b2",
  400: "#5fcf9c",
  300: "#9ff0cb",
  200: "#1d4a37",
  100: "#17352a",
  50: "#132a21",
} as const;

/** Serie wykresów i kategorie – kolejne odcienie zieleni, kontrastowe względem siebie. */
export const GREEN_SERIES = [GREEN[700], "#ff8a5c", GREEN[300], GREEN[900], "#ffc2a6", GREEN[500], GREEN[800], "#e0663a"];

export const COPPER = "#ff8a5c";
export const CREAM = "#0f1412";

/** Kolory rodzajów elementów mapy. */
export const CATEGORY_GREEN = { source: GREEN[900], page: GREEN[700], action: GREEN[500], offline: COPPER } as const;
