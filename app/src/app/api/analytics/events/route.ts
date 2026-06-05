import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {PRIVATE_JSON_HEADERS} from "@/server/http/response-headers";

export async function POST(request: Request) {
    const { isAuthenticated, userId } = await auth();

    if (!isAuthenticated) {
        return NextResponse.json(
            {error:"unauthorized"},
            {status: 401, headers: PRIVATE_JSON_HEADERS},
        );
    }


}