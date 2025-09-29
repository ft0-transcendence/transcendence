export const getImageByUrlOrBlob = (imgUrl: string | null, imgBlob: Uint8Array<ArrayBufferLike> | null, imgMimeType: string | null) => {
	if (imgBlob !== null){
		const uint8Array = new Uint8Array(imgBlob) as unknown as ArrayBuffer;
		const blob = new Blob([uint8Array], { type: imgMimeType ?? "image/png" });
		return URL.createObjectURL(blob);
	}
	return imgUrl;
}

export const getProfilePictureUrlByUserId = (userId: string) => {
	return `/api/avatar/${userId}?t=${Date.now()}`;
}
