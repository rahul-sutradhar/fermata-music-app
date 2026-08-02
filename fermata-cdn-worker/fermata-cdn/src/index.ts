import { AwsClient } from 'aws4fetch';

export interface Env {
	B2_BUCKET_NAME: string;
	B2_ACCESS_KEY_ID: string;
	B2_SECRET_ACCESS_KEY: string;
	B2_REGION: string;
}

async function consumeStream(response: Response) {
	if (!response.body) return;
	const reader = response.body.getReader();
	try {
		while (true) {
			const { done } = await reader.read();
			if (done) break;
		}
	} catch (e) {
		// Suppress stream consumption aborts/failures
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		
		// Use S3 virtual-host style URL: https://<bucket>.s3.<region>.backblazeb2.com/<key>
		const B2_ENDPOINT = `s3.${env.B2_REGION}.backblazeb2.com`;
		const s3Url = new URL(url.pathname + url.search, `https://${env.B2_BUCKET_NAME}.${B2_ENDPOINT}`);
		
		// Initialize S3 signer
		const aws = new AwsClient({
			accessKeyId: env.B2_ACCESS_KEY_ID,
			secretAccessKey: env.B2_SECRET_ACCESS_KEY,
			service: 's3',
			region: env.B2_REGION,
		});
		
		// Sign request with B2 S3 credentials
		const signedRequest = await aws.sign(s3Url.toString(), {
			method: 'GET',
		});
		
		// Fetch the file from B2
		const response = await fetch(signedRequest);
		
		// Set CORS and Cache-Control headers
		const headers = new Headers(response.headers);
		headers.set("Access-Control-Allow-Origin", "*");
		headers.set("Access-Control-Allow-Methods", "GET, OPTIONS, HEAD");
		headers.set("Access-Control-Allow-Headers", "*");

		if (response.status === 200 && request.method === "GET") {
			// If it's the HLS playlist, rewrite it to append the version query param to each segment URL
			if (url.pathname.endsWith("playlist.m3u8")) {
				const version = url.searchParams.get("v");
				if (version) {
					const text = await response.text();
					const lines = text.split("\n").map(line => {
						const trimmed = line.trim();
						if (trimmed && !trimmed.startsWith("#") && trimmed.endsWith(".ts")) {
							const separator = trimmed.includes("?") ? "&" : "?";
							const hasCR = line.endsWith("\r");
							return `${trimmed}${separator}v=${version}${hasCR ? "\r" : ""}`;
						}
						return line;
					});
					const rewrittenText = lines.join("\n");

					headers.set("Cache-Control", "public, max-age=31536000"); // Cache versioned playlist for 1 year
					return new Response(rewrittenText, {
						status: response.status,
						headers
					});
				}
			}

			// Cache all other assets (segments with v= query params, cover images, raw downloads) for 1 year
			headers.set("Cache-Control", "public, max-age=31536000");

			// Clone the response so we can consume the stream in the background
			const cacheClone = response.clone();
			ctx.waitUntil(consumeStream(cacheClone));
		} else {
			// Do not cache errors or non-GET requests
			headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
		}

		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers
		});
	},
} satisfies ExportedHandler<Env>;
