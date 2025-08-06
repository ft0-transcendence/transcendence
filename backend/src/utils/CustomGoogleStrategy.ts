import { getRequestOrigin } from "../fastify-routes/public";
import { AuthenticateOptionsGoogle, Strategy as GoogleStrategy, Profile, StrategyOptions, VerifyCallback } from "passport-google-oauth20";
import { Request } from "express";
import { RouteHandlerMethod } from "fastify";
import { AuthenticationRoute } from "@fastify/passport/dist/AuthenticationRoute";

export type CustomGoogleStrategyOptions = StrategyOptions & {callbackURL?: string, redirect_uri?: string};

export class CustomGoogleStrategy extends GoogleStrategy {
	constructor(options: CustomGoogleStrategyOptions, verify: (accessToken: string, refreshToken: string, profile: Profile, done: VerifyCallback) => void) {
		super(options, verify);
	}
	authenticate(req: Request, options?: CustomGoogleStrategyOptions) {
		if (options && options.callbackURL){
			options.redirect_uri = options.callbackURL;
			delete options.callbackURL;
		}
		return super.authenticate(req, options) as any;
	}
	authorizationParams(options: any) {
		const params: any = super.authorizationParams(options);
		if (options.callbackURL){
			params.redirect_uri = options.callbackURL;
			params.callbackURL = options.callbackURL;
		}
		return params;
	}
}
