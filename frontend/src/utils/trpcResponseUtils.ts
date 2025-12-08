import { LanguageKeys, t } from "@src/tools/i18n";
import toast from "@src/tools/Toast";
import { TRPCClientError } from "@trpc/client"

export const showAndLogTrpcError = (err: unknown, toastTitle: LanguageKeys) => {
	const msgKey = t(toastTitle);
	if (err instanceof TRPCClientError) {
		const zodError = err.data?.zodError;
		if (zodError && zodError.fieldErrors) {
			const msg = err.data?.zodError?.fieldErrors ? Object.values(err.data.zodError.fieldErrors).join(', ') : err.message;
			toast.error(msgKey, msg);
		} else {
			toast.warn(msgKey, err.message);
			console.debug('TRPC error', err);
		}
	} else {
		toast.error(msgKey, t("error.generic_server_error") ?? "");
		console.error('Generic Fetch error', err);
	}
}
