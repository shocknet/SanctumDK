type Request = any;
type Response = any;
export type ResultError = {
    status: 'ERROR';
    reason: string;
};
export type RequestInfo = {
    rpcName: string;
    batch: boolean;
    nostr: boolean;
    batchSize: number;
};
export type RequestStats = {
    startMs: number;
    start: bigint;
    parse: bigint;
    guard: bigint;
    validate: bigint;
    handle: bigint;
};
export type RequestMetric = AuthContext & RequestInfo & RequestStats & {
    error?: string;
};
export type GuestContext = {};
export type GuestMethodInputs = MintFromRefreshToken_Input;
export type GuestMethodOutputs = MintFromRefreshToken_Output;
export type AccessTokenContext = {
    grant_id: string;
};
export type AccessTokenMethodInputs = GetNostrPubKey_Input | GetNostrRelays_Input | SignNostrEvent_Input | Nip44Decrypt_Input | Nip44Encrypt_Input | Nip98Event_Input;
export type AccessTokenMethodOutputs = GetNostrPubKey_Output | GetNostrRelays_Output | SignNostrEvent_Output | Nip44Decrypt_Output | Nip44Encrypt_Output | Nip98Event_Output;
export type UserContext = {
    user_id: string;
};
export type AuthContext = GuestContext | AccessTokenContext;
export type GetNostrPubKey_Input = {
    rpcName: 'GetNostrPubKey';
};
export type GetNostrPubKey_Output = ResultError | ({
    status: 'OK';
} & UserNostrPubKey);
export type GetNostrRelays_Input = {
    rpcName: 'GetNostrRelays';
};
export type GetNostrRelays_Output = ResultError | ({
    status: 'OK';
} & NostrRelays);
export type SignNostrEvent_Input = {
    rpcName: 'SignNostrEvent';
    req: NostrSignRequest;
};
export type SignNostrEvent_Output = ResultError | ({
    status: 'OK';
} & NostrSignResponse);
export type Nip44Decrypt_Input = {
    rpcName: 'Nip44Decrypt';
    req: Nip44DecryptRequest;
};
export type Nip44Decrypt_Output = ResultError | ({
    status: 'OK';
} & Nip44DecryptResponse);
export type Nip44Encrypt_Input = {
    rpcName: 'Nip44Encrypt';
    req: Nip44EncryptRequest;
};
export type Nip44Encrypt_Output = ResultError | ({
    status: 'OK';
} & Nip44EncryptResponse);
export type Nip98Event_Input = {
    rpcName: 'Nip98Event';
    req: Nip98EventRequest;
};
export type Nip98Event_Output = ResultError | ({
    status: 'OK';
} & Nip98EventResponse);
export type MintFromRefreshToken_Input = {
    rpcName: 'MintFromRefreshToken';
    req: MintFromRefreshTokenRequest;
};
export type MintFromRefreshToken_Output = ResultError | ({
    status: 'OK';
} & TokensData);
export type ServerMethods = {
    GetNostrPubKey?: (req: GetNostrPubKey_Input & {
        ctx: AccessTokenContext;
        requestObject: Request;
        responseObject: Response;
    }) => Promise<UserNostrPubKey>;
    GetNostrRelays?: (req: GetNostrRelays_Input & {
        ctx: AccessTokenContext;
        requestObject: Request;
        responseObject: Response;
    }) => Promise<NostrRelays>;
    SignNostrEvent?: (req: SignNostrEvent_Input & {
        ctx: AccessTokenContext;
        requestObject: Request;
        responseObject: Response;
    }) => Promise<NostrSignResponse>;
    Nip44Decrypt?: (req: Nip44Decrypt_Input & {
        ctx: AccessTokenContext;
        requestObject: Request;
        responseObject: Response;
    }) => Promise<Nip44DecryptResponse>;
    Nip44Encrypt?: (req: Nip44Encrypt_Input & {
        ctx: AccessTokenContext;
        requestObject: Request;
        responseObject: Response;
    }) => Promise<Nip44EncryptResponse>;
    Nip98Event?: (req: Nip98Event_Input & {
        ctx: AccessTokenContext;
        requestObject: Request;
        responseObject: Response;
    }) => Promise<Nip98EventResponse>;
    MintFromRefreshToken?: (req: MintFromRefreshToken_Input & {
        ctx: GuestContext;
        requestObject: Request;
        responseObject: Response;
    }) => Promise<TokensData>;
};
export declare enum ErrorCode {
    ERROR_CODE_UNSPECIFIED = "ERROR_CODE_UNSPECIFIED",
    INVALID_SESSION = "INVALID_SESSION",
    ACCESS_TOKEN_INVALID = "ACCESS_TOKEN_INVALID",
    ACCESS_TOKEN_EXPIRED = "ACCESS_TOKEN_EXPIRED",
    ACCESS_FORBIDDEN = "ACCESS_FORBIDDEN",
    USER_NOT_FOUND = "USER_NOT_FOUND",
    GRANT_REVOKED = "GRANT_REVOKED",
    GRANT_NOT_FOUND = "GRANT_NOT_FOUND",
    CLIENT_BINDING_MISMATCH = "CLIENT_BINDING_MISMATCH",
    UPDATE_APP_TO_NEW_VERSION = "UPDATE_APP_TO_NEW_VERSION",
    OTP_INVALID = "OTP_INVALID",
    OTP_NOT_FOUND_OR_EXPIRED = "OTP_NOT_FOUND_OR_EXPIRED",
    OTP_ATTEMPTS_EXCEEDED = "OTP_ATTEMPTS_EXCEEDED",
    REQUEST_TOKEN_NOT_FOUND_OR_EXPIRED = "REQUEST_TOKEN_NOT_FOUND_OR_EXPIRED",
    REQUEST_TOKEN_INVALID = "REQUEST_TOKEN_INVALID",
    REFRESH_TOKEN_INVALID = "REFRESH_TOKEN_INVALID",
    REFRESH_TOKEN_EXPIRED = "REFRESH_TOKEN_EXPIRED",
    REFRESH_TOKEN_REPLAYED = "REFRESH_TOKEN_REPLAYED",
    INVALID_INPUT = "INVALID_INPUT",
    UNKNOWN_ERROR = "UNKNOWN_ERROR"
}
export type OptionsBaseMessage = {
    allOptionalsAreSet?: true;
};
export type Nip44DecryptRequest = {
    ciphertext: string;
    pubkey: string;
};
export declare const Nip44DecryptRequestOptionalFields: [];
export type Nip44DecryptRequestOptions = OptionsBaseMessage & {
    checkOptionalsAreSet?: [];
    pubkey_CustomCheck?: (v: string) => boolean;
    ciphertext_CustomCheck?: (v: string) => boolean;
};
export declare const Nip44DecryptRequestValidate: (o?: Nip44DecryptRequest, opts?: Nip44DecryptRequestOptions, path?: string) => Error | null;
export type Nip44DecryptResponse = {
    plaintext: string;
};
export declare const Nip44DecryptResponseOptionalFields: [];
export type Nip44DecryptResponseOptions = OptionsBaseMessage & {
    checkOptionalsAreSet?: [];
    plaintext_CustomCheck?: (v: string) => boolean;
};
export declare const Nip44DecryptResponseValidate: (o?: Nip44DecryptResponse, opts?: Nip44DecryptResponseOptions, path?: string) => Error | null;
export type Nip44EncryptResponse = {
    ciphertext: string;
};
export declare const Nip44EncryptResponseOptionalFields: [];
export type Nip44EncryptResponseOptions = OptionsBaseMessage & {
    checkOptionalsAreSet?: [];
    ciphertext_CustomCheck?: (v: string) => boolean;
};
export declare const Nip44EncryptResponseValidate: (o?: Nip44EncryptResponse, opts?: Nip44EncryptResponseOptions, path?: string) => Error | null;
export type UserNostrPubKey = {
    pubkey: string;
};
export declare const UserNostrPubKeyOptionalFields: [];
export type UserNostrPubKeyOptions = OptionsBaseMessage & {
    checkOptionalsAreSet?: [];
    pubkey_CustomCheck?: (v: string) => boolean;
};
export declare const UserNostrPubKeyValidate: (o?: UserNostrPubKey, opts?: UserNostrPubKeyOptions, path?: string) => Error | null;
export type Nip98EventRequest = {
    url: string;
    request_body?: string;
    method: string;
};
export type Nip98EventRequestOptionalField = 'request_body';
export declare const Nip98EventRequestOptionalFields: Nip98EventRequestOptionalField[];
export type Nip98EventRequestOptions = OptionsBaseMessage & {
    checkOptionalsAreSet?: Nip98EventRequestOptionalField[];
    request_body_CustomCheck?: (v?: string) => boolean;
    method_CustomCheck?: (v: string) => boolean;
    url_CustomCheck?: (v: string) => boolean;
};
export declare const Nip98EventRequestValidate: (o?: Nip98EventRequest, opts?: Nip98EventRequestOptions, path?: string) => Error | null;
export type Nip44EncryptRequest = {
    plaintext: string;
    pubkey: string;
};
export declare const Nip44EncryptRequestOptionalFields: [];
export type Nip44EncryptRequestOptions = OptionsBaseMessage & {
    checkOptionalsAreSet?: [];
    plaintext_CustomCheck?: (v: string) => boolean;
    pubkey_CustomCheck?: (v: string) => boolean;
};
export declare const Nip44EncryptRequestValidate: (o?: Nip44EncryptRequest, opts?: Nip44EncryptRequestOptions, path?: string) => Error | null;
export type MintFromRefreshTokenRequest = {
    refresh_token: string;
};
export declare const MintFromRefreshTokenRequestOptionalFields: [];
export type MintFromRefreshTokenRequestOptions = OptionsBaseMessage & {
    checkOptionalsAreSet?: [];
    refresh_token_CustomCheck?: (v: string) => boolean;
};
export declare const MintFromRefreshTokenRequestValidate: (o?: MintFromRefreshTokenRequest, opts?: MintFromRefreshTokenRequestOptions, path?: string) => Error | null;
export type AuthSocketAuthRequestTokenResponse = {
    expires_at: number;
    request_token: string;
};
export declare const AuthSocketAuthRequestTokenResponseOptionalFields: [];
export type AuthSocketAuthRequestTokenResponseOptions = OptionsBaseMessage & {
    checkOptionalsAreSet?: [];
    expires_at_CustomCheck?: (v: number) => boolean;
    request_token_CustomCheck?: (v: string) => boolean;
};
export declare const AuthSocketAuthRequestTokenResponseValidate: (o?: AuthSocketAuthRequestTokenResponse, opts?: AuthSocketAuthRequestTokenResponseOptions, path?: string) => Error | null;
export type AuthSocketClientHello = {
    client_key: string;
    protocol_version: number;
    request_token?: string;
};
export type AuthSocketClientHelloOptionalField = 'request_token';
export declare const AuthSocketClientHelloOptionalFields: AuthSocketClientHelloOptionalField[];
export type AuthSocketClientHelloOptions = OptionsBaseMessage & {
    checkOptionalsAreSet?: AuthSocketClientHelloOptionalField[];
    client_key_CustomCheck?: (v: string) => boolean;
    protocol_version_CustomCheck?: (v: number) => boolean;
    request_token_CustomCheck?: (v?: string) => boolean;
};
export declare const AuthSocketClientHelloValidate: (o?: AuthSocketClientHello, opts?: AuthSocketClientHelloOptions, path?: string) => Error | null;
export type AuthSocketResponse = {
    payload: AuthSocketResponse_payload;
};
export declare const AuthSocketResponseOptionalFields: [];
export type AuthSocketResponseOptions = OptionsBaseMessage & {
    checkOptionalsAreSet?: [];
    payload_Options?: AuthSocketResponse_payloadOptions;
};
export declare const AuthSocketResponseValidate: (o?: AuthSocketResponse, opts?: AuthSocketResponseOptions, path?: string) => Error | null;
export type Empty = {};
export declare const EmptyOptionalFields: [];
export type EmptyOptions = OptionsBaseMessage & {
    checkOptionalsAreSet?: [];
};
export declare const EmptyValidate: (o?: Empty, opts?: EmptyOptions, path?: string) => Error | null;
export type NostrRelays = {
    relays: Record<string, RelayPolicy>;
};
export declare const NostrRelaysOptionalFields: [];
export type NostrRelaysOptions = OptionsBaseMessage & {
    checkOptionalsAreSet?: [];
    relays_EntryOptions?: RelayPolicyOptions;
    relays_CustomCheck?: (v: Record<string, RelayPolicy>) => boolean;
};
export declare const NostrRelaysValidate: (o?: NostrRelays, opts?: NostrRelaysOptions, path?: string) => Error | null;
export type NostrSignRequest = {
    usignedEvent: string;
};
export declare const NostrSignRequestOptionalFields: [];
export type NostrSignRequestOptions = OptionsBaseMessage & {
    checkOptionalsAreSet?: [];
    usignedEvent_CustomCheck?: (v: string) => boolean;
};
export declare const NostrSignRequestValidate: (o?: NostrSignRequest, opts?: NostrSignRequestOptions, path?: string) => Error | null;
export type NostrSignResponse = {
    signedEvent: string;
};
export declare const NostrSignResponseOptionalFields: [];
export type NostrSignResponseOptions = OptionsBaseMessage & {
    checkOptionalsAreSet?: [];
    signedEvent_CustomCheck?: (v: string) => boolean;
};
export declare const NostrSignResponseValidate: (o?: NostrSignResponse, opts?: NostrSignResponseOptions, path?: string) => Error | null;
export type RelayPolicy = {
    read: boolean;
    write: boolean;
};
export declare const RelayPolicyOptionalFields: [];
export type RelayPolicyOptions = OptionsBaseMessage & {
    checkOptionalsAreSet?: [];
    read_CustomCheck?: (v: boolean) => boolean;
    write_CustomCheck?: (v: boolean) => boolean;
};
export declare const RelayPolicyValidate: (o?: RelayPolicy, opts?: RelayPolicyOptions, path?: string) => Error | null;
export type Nip98EventResponse = {
    authorization_header: string;
};
export declare const Nip98EventResponseOptionalFields: [];
export type Nip98EventResponseOptions = OptionsBaseMessage & {
    checkOptionalsAreSet?: [];
    authorization_header_CustomCheck?: (v: string) => boolean;
};
export declare const Nip98EventResponseValidate: (o?: Nip98EventResponse, opts?: Nip98EventResponseOptions, path?: string) => Error | null;
export type TokensData = {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    refresh_expires_at: number;
    identifier: string;
    account_identifier: string;
};
export declare const TokensDataOptionalFields: [];
export type TokensDataOptions = OptionsBaseMessage & {
    checkOptionalsAreSet?: [];
    access_token_CustomCheck?: (v: string) => boolean;
    refresh_token_CustomCheck?: (v: string) => boolean;
    expires_at_CustomCheck?: (v: number) => boolean;
    refresh_expires_at_CustomCheck?: (v: number) => boolean;
    identifier_CustomCheck?: (v: string) => boolean;
    account_identifier_CustomCheck?: (v: string) => boolean;
};
export declare const TokensDataValidate: (o?: TokensData, opts?: TokensDataOptions, path?: string) => Error | null;
export declare enum AuthSocketResponse_payload_type {
    REQUEST_TOKEN = "request_token",
    TOKENS = "tokens"
}
export declare const enumCheckAuthSocketResponse_payload_type: (e?: AuthSocketResponse_payload_type) => boolean;
export type AuthSocketResponse_payload = {
    type: AuthSocketResponse_payload_type.REQUEST_TOKEN;
    request_token: AuthSocketAuthRequestTokenResponse;
} | {
    type: AuthSocketResponse_payload_type.TOKENS;
    tokens: TokensData;
};
export type AuthSocketResponse_payloadOptions = {
    request_token_Options?: AuthSocketAuthRequestTokenResponseOptions;
    tokens_Options?: TokensDataOptions;
};
export declare const AuthSocketResponse_payloadValidate: (o?: AuthSocketResponse_payload, opts?: AuthSocketResponse_payloadOptions, path?: string) => Error | null;
export {};
