import { TRPCError } from "@trpc/server";
import {protectedProcedure, t} from "../trpc";
import { z } from "zod";

const MAX_PROFILE_PICTURE_SIZE_MB = 2.5;
const MAX_PROFILE_PICTURE_SIZE_BYTES = MAX_PROFILE_PICTURE_SIZE_MB * 1024 * 1024;

export const userRouter = t.router({
	getUser: protectedProcedure
		.query(async ({ctx}) => {
			const user = await ctx.db.user.findFirst({
				where: {
					id: ctx.user!.id,
				},
			});
			return user;
		}),


	updateUsername: protectedProcedure
		.input(z.object({
			username: z.string()
				.min(3, { message: "Il nome deve avere almeno 3 caratteri" })
				.max(24, { message: "Il nome può avere al massimo 24 caratteri" })
				.regex(/^[a-zA-Z0-9_]+$/, { message: "Solo lettere, numeri e _" })
		}))
		.mutation(async ({ ctx, input }) => {

			const existing = await ctx.db.user.findFirst({ where: { username: input.username } });
			if (existing && existing.id !== ctx.user!.id) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "The username is already taken" });
			}

			return ctx.db.user.update({
				where: { id: ctx.user!.id },
				data: { username: input.username },
			});
		}),

	uploadAvatar: protectedProcedure
		.input(z.object({
			dataUrl: z.string().min(10).optional(),
			imageUrl: z.string().url().optional()
		}).refine(data => data.dataUrl || data.imageUrl, {
			message: "dataUrl or imageUrl is required"
		}))
		.mutation(async ({ ctx, input }) => {
			if (input.dataUrl) {
				const [header, base64] = input.dataUrl.split(",");
				if (!header || !base64) {
					throw new Error("INVALID_DATA_URL");
				}
				const match = /data:(.*);base64/.exec(header);
				const mime = match?.[1] ?? "image/png";
				const buffer = Buffer.from(base64, "base64");

				const sizeBytes = buffer.length;
				console.log("Uploading avatar. Size:", sizeBytes, "bytes");
				if (sizeBytes > MAX_PROFILE_PICTURE_SIZE_BYTES) {
					throw new TRPCError({ code: "BAD_REQUEST", message: `File too large. Max ${MAX_PROFILE_PICTURE_SIZE_MB}MB` });
				}

				return ctx.db.user.update({
					where: { id: ctx.user!.id },
					data: {
						imageBlob: buffer,
						imageBlobMimeType: mime,
						imageUrl: null
					},
				});
			} else if (input.imageUrl) {
				try {
					const response = await fetch(input.imageUrl);
					if (!response.ok) {
						throw new Error("INVALID_IMAGE_URL");
					}
					const contentLength = response.headers.get('content-length');
					if (contentLength && parseInt(contentLength) > MAX_PROFILE_PICTURE_SIZE_BYTES) {
						throw new TRPCError({ code: "BAD_REQUEST", message: `File too large. Max ${MAX_PROFILE_PICTURE_SIZE_MB}MB` });
					}
					const blob = await response.blob();
					const buffer = new Uint8Array(await blob.arrayBuffer());

					return ctx.db.user.update({
						where: { id: ctx.user!.id },
						data: {
							imageUrl: input.imageUrl,
							imageBlob: buffer,
							imageBlobMimeType: blob.type
						},
					});
				} catch (error) {
					throw new Error("FAILED_TO_DOWNLOAD_IMAGE");
				}
			}
		}),
})
