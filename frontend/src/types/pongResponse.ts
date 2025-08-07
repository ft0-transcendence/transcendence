export type PongResponse =
    | { status: "started" }
    | { status: "paused" }
    | { status: "resumed" }
    | { status: "paddle moved" };