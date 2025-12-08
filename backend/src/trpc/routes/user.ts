import { TRPCError } from "@trpc/server";
import {protectedProcedure, publicProcedure, t} from "../trpc";
import { z } from "zod";
import { AppLanguage } from '../../../shared_exports';
import sanitizeHtml from 'sanitize-html';
import { PrismaClient } from "@prisma/client";

const MAX_PROFILE_PICTURE_SIZE_MB = 2.5;
const MAX_PROFILE_PICTURE_SIZE_BYTES = MAX_PROFILE_PICTURE_SIZE_MB * 1024 * 1024;

async function calculateUserStats(db: PrismaClient, userId: string) {
	const userGames = await db.game.findMany({
		where: {
			endDate: { not: null },
			abortDate: null,
			OR: [
				{ leftPlayerId: userId },
				{ rightPlayerId: userId }
			]
		},
		select: {
			leftPlayerId: true,
			rightPlayerId: true,
			leftPlayerScore: true,
			rightPlayerScore: true
		}
	});

	let totalWins = 0;
	let totalLosses = 0;

	for (const game of userGames) {
		const isLeftPlayer = game.leftPlayerId === userId;
		const userScore = isLeftPlayer ? game.leftPlayerScore : game.rightPlayerScore;
		const opponentScore = isLeftPlayer ? game.rightPlayerScore : game.leftPlayerScore;

		if (userScore > opponentScore) {
			totalWins++;
		} else if (userScore < opponentScore) {
			totalLosses++;
		}
	}

	const totalGames = totalWins + totalLosses;
	const winRate = totalGames > 0 ? (totalWins / totalGames) * 100 : 0;

	return {
		totalWins,
		totalLosses,
		totalGames,
		winRate: Math.round(winRate * 100) / 100 // Round to 2 decimal places
	};
}

export const userRouter = t.router({
	getUser: protectedProcedure
		.query(async ({ctx}) => {
			const user = await ctx.db.user.findFirst({
				where: {
					id: ctx.user!.id,
				},
				select: {
					username: true,
					id: true,
					preferredLanguage: true,
					email: true,
					createdAt: true,
				}
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

				await ctx.db.user.update({
					where: { id: ctx.user!.id },
					data: {
						imageBlob: buffer,
						imageBlobMimeType: mime,
						imageUrl: null
					},
				});
				return { success: true };
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

					await ctx.db.user.update({
						where: { id: ctx.user!.id },
						data: {
							imageUrl: input.imageUrl,
							imageBlob: buffer,
							imageBlobMimeType: blob.type
						},
					});
					return { success: true };
				} catch (error) {
					throw new Error("FAILED_TO_DOWNLOAD_IMAGE");
				}
			}
		}),
	updateUserLanguage: protectedProcedure
		.input(z.object({
			lang: z.nativeEnum(AppLanguage, {invalid_type_error: "Invalid language code"})
		}))
		.mutation(async ({ ctx, input }) => {
			const result = await ctx.db.user.update({
				where: { id: ctx.user!.id },
				data: { preferredLanguage: input.lang },
				select: { username: true, id: true, preferredLanguage: true }
			});

			return result;
		}),

	getUserStats: protectedProcedure
		.query(async ({ ctx }) => {
			const user = await ctx.db.user.findUnique({
				where: { id: ctx.user!.id },
				select: {
					username: true,
					tournamentsWon: true
				}
			});

			if (!user) {
				throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
			}

			const stats = await calculateUserStats(ctx.db, ctx.user!.id);

			return {
				username: user.username,
				tournamentsWon: user.tournamentsWon,
				...stats
			};
		}),

	getUserStatsById: publicProcedure
		.input(z.object({
			userId: z.string()
		}))
		.query(async ({ ctx, input }) => {
			const user = await ctx.db.user.findUnique({
				where: { id: input.userId },
				select: {
					username: true,
					tournamentsWon: true
				}
			});

			if (!user) {
				throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
			}

			const stats = await calculateUserStats(ctx.db, input.userId);

			return {
				username: user.username,
				tournamentsWon: user.tournamentsWon,
				...stats
			};
		})
})
