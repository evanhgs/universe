"use client";

import { useState } from "react";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type ApiState = {
  status: number | null;
  body: JsonValue | null;
};

const initialState: ApiState = {
  status: null,
  body: null,
};

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();

  return {
    status: response.status,
    body: text ? (JSON.parse(text) as JsonValue) : null,
  };
}

export default function AccountTestPage() {
  const [me, setMe] = useState<ApiState>(initialState);
  const [profile, setProfile] = useState<ApiState>(initialState);
  const [roles, setRoles] = useState<ApiState>(initialState);
  const [profilePayload, setProfilePayload] = useState(
    JSON.stringify(
      {
        displayName: "Seed Seller Updated",
        bio: "Test profile update from /account-test.",
        city: "Paris",
        countryCode: "FR",
        isPublic: true,
      },
      null,
      2,
    ),
  );
  const [rolesPayload, setRolesPayload] = useState(
    JSON.stringify(
      {
        roles: ["BUYER", "SELLER"],
      },
      null,
      2,
    ),
  );
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setError(null);

    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  return (
    <main className="p-6">
      <h1>Account API test</h1>
      <p>Routes testees: /api/account/me, /api/account/me/profile, /api/account/me/roles</p>
      <p>Il faut etre connecte avec Clerk pour que ces routes repondent en 200.</p>

      {error ? <p style={{ color: "red" }}>{error}</p> : null}

      <hr style={{ margin: "16px 0" }} />

      <section>
        <h2>GET /api/account/me</h2>
        <button
          onClick={() =>
            run(async () => {
              setMe(await request("/api/account/me"));
            })
          }
          type="button"
        >
          Load me
        </button>
        <p>Status: {me.status ?? "not called"}</p>
        <pre>{JSON.stringify(me.body, null, 2)}</pre>
      </section>

      <hr style={{ margin: "16px 0" }} />

      <section>
        <h2>GET /api/account/me/profile</h2>
        <button
          onClick={() =>
            run(async () => {
              setProfile(await request("/api/account/me/profile"));
            })
          }
          type="button"
        >
          Load profile
        </button>
        <p>Status: {profile.status ?? "not called"}</p>
        <pre>{JSON.stringify(profile.body, null, 2)}</pre>
      </section>

      <section>
        <h2>PATCH /api/account/me/profile</h2>
        <textarea
          onChange={(event) => setProfilePayload(event.target.value)}
          rows={12}
          style={{ display: "block", width: "100%", marginTop: 8 }}
          value={profilePayload}
        />
        <button
          onClick={() =>
            run(async () => {
              setProfile(
                await request("/api/account/me/profile", {
                  method: "PATCH",
                  body: profilePayload,
                }),
              );
            })
          }
          type="button"
        >
          Update profile
        </button>
      </section>

      <hr style={{ margin: "16px 0" }} />

      <section>
        <h2>GET /api/account/me/roles</h2>
        <button
          onClick={() =>
            run(async () => {
              setRoles(await request("/api/account/me/roles"));
            })
          }
          type="button"
        >
          Load roles
        </button>
        <p>Status: {roles.status ?? "not called"}</p>
        <pre>{JSON.stringify(roles.body, null, 2)}</pre>
      </section>

      <section>
        <h2>PUT /api/account/me/roles</h2>
        <textarea
          onChange={(event) => setRolesPayload(event.target.value)}
          rows={8}
          style={{ display: "block", width: "100%", marginTop: 8 }}
          value={rolesPayload}
        />
        <button
          onClick={() =>
            run(async () => {
              setRoles(
                await request("/api/account/me/roles", {
                  method: "PUT",
                  body: rolesPayload,
                }),
              );
            })
          }
          type="button"
        >
          Update roles
        </button>
      </section>
    </main>
  );
}
