export type JwtPayload = {
  sub: string; // user id
  email: string;
  role: string;
};

export type JwtPayloadWithRefresh = JwtPayload & {
  refreshToken: string;
};
