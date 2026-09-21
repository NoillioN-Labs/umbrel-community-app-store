export interface RouteCredentials {
  username: string;
  password: string;
}

export interface GatewayRoute {
  id: "owner" | "renter";
  host: string;
  port: number;
  credentials?: RouteCredentials;
  publicOnly: boolean;
}

export interface GatewayEvent {
  occurredAt: string;
  type: string;
  routeId?: GatewayRoute["id"];
  connectionId?: string;
  detail?: string;
}

