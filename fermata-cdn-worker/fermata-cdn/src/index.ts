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
		const s3Url = new URL(url.pathname, `https://${env.B2_BUCKET_NAME}.${B2_ENDPOINT}`);
		
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
		
		// Add Cache-Control headers for Cloudflare edge cache
		if (response.status === 200 && request.method === "GET") {
			const headers = new Headers(response.headers);
			headers.set("Cache-Control", "public, max-age=31536000"); // Cache for 1 year
			headers.set("Access-Control-Allow-Origin", "*");         // Enable CORS for players
			
			// Clone the response so we can consume the stream in the background
			const cacheClone = response.clone();
			ctx.waitUntil(consumeStream(cacheClone));
			
			return new Response(response.body, {
				status: response.status,
				headers
			});
		}
		
		return response;
	},
} satisfies ExportedHandler<Env>;
