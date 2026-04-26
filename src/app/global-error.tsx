"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="el">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            padding: "1.5rem",
            textAlign: "center",
            background: "#050d1a",
            color: "#f0f4ff",
          }}
        >
          <p style={{ fontSize: "0.9rem" }}>Κάτι πήγε στραβά, ανανεώστε τη σελίδα</p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid rgba(201, 168, 76, 0.4)",
              background: "rgba(15, 30, 53, 0.8)",
            }}
          >
            Δοκιμάστε ξανά
          </button>
        </div>
      </body>
    </html>
  );
}
