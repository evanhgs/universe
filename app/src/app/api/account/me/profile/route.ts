import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";
import {
  getCurrentAccountSnapshot,
  updateCurrentAccountProfile,
} from "@/server/account/account.service";
import { parseProfileUpdateInput } from "@/server/account/account.validation";

/**
 * Retourne le profil du compte authentifie.
 * @returns Reponse JSON privee contenant le profil courant.
 */
export async function GET() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const account = await getCurrentAccountSnapshot();

  return NextResponse.json(account.profile, {
    status: 200,
    headers: PRIVATE_JSON_HEADERS,
  });
}

/**
 * Met a jour le profil du compte authentifie.
 * @param request Requete HTTP contenant le payload de profil brut.
 */
export async function PATCH(request: Request) {
  const { isAuthenticated, userId } = await auth();

  if (!isAuthenticated) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: PRIVATE_JSON_HEADERS },
    );
  }

  try {
    const input = parseProfileUpdateInput(await request.json());
    const account = await updateCurrentAccountProfile(userId, input);

    return NextResponse.json(account, {
      status: 200,
      headers: PRIVATE_JSON_HEADERS,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "invalid_profile_update",
        message: error instanceof Error ? error.message : "Unknown error.",
      },
      {
        status: 400,
        headers: PRIVATE_JSON_HEADERS,
      },
    );
  }
}
