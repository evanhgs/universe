import "server-only";

import type { AnalyticsEventType } from "../../../generated/prisma/enums";

export type AnalyticsTypes = {
    id: string;
    type: AnalyticsEventType;
    beatId?: string;
    userId?: string;
    sessionId?: string;
    source?: string;
    watchMs?: number;
    metadataJson: JSON;
    occurredAt: Date;
    createdAt: Date;
}