"use client";

export function LogoutButton() {
  return (
    <button
      className="btn small"
      onClick={async () => {
        await fetch("/api/logout", { method: "POST" });
        window.location.href = "/login";
      }}
    >
      Wyloguj
    </button>
  );
}
