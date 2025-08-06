import { GOOGLE_AUTH_CALLBACK_URL } from "../fastify-routes/public";
import { Strategy as GoogleStrategy, Profile, StrategyOptions, VerifyCallback } from "passport-google-oauth20";
import { Request } from "express";
import { getRequestOrigin } from "./fastifyRequestUtils";

export type CustomGoogleStrategyOptions = StrategyOptions & {callbackURL?: string, redirect_uri?: string};

/**
 * This class extends the GoogleStrategy from passport-google-oauth20
 * and overrides the authenticate method to set the callbackURL when creating the auth request to the Google API.
 * This is necessary to get the callback to be exactly the same as the requestor's origin (so it can redirect back to the frontend).
 */
export class CustomGoogleStrategy extends GoogleStrategy {
	constructor(options: CustomGoogleStrategyOptions, verify: (accessToken: string, refreshToken: string, profile: Profile, done: VerifyCallback) => void) {
		super(options, verify);
	}
	authenticate(req: Request, options?: CustomGoogleStrategyOptions) {
		if (!options){
			options = {} as CustomGoogleStrategyOptions;
		}
		options.callbackURL = GOOGLE_AUTH_CALLBACK_URL(getRequestOrigin(req, 'backend'));
		return super.authenticate(req, options);
	}
	authorizationParams(options: any) {
		const params: any = super.authorizationParams(options);
		if (options.callbackURL){
			params.redirect_uri = options.callbackURL;
		}
		return params;
	}
}
