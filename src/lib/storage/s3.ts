import type { Readable } from 'node:stream'

import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

import { createLogger } from '@/lib/logger'

import type { StorageAdapter } from './adapter'
import { UploadError } from './errors'

const log = createLogger('storage.s3')

export interface S3StorageAdapterOptions {
	endpoint: string
	region: string
	bucket: string
	accessKeyId: string
	secretAccessKey: string
	forcePathStyle: boolean
	// When set, public URLs are `${publicUrlBase}/${key}`. When undefined, the
	// adapter returns `/api/files/${key}` and a companion route proxies the
	// bytes. Self-host operators who don't expose their bucket on the public
	// internet should leave this unset.
	publicUrlBase?: string
}

export class S3StorageAdapter implements StorageAdapter {
	private client: S3Client
	private bucket: string
	private publicUrlBase?: string

	constructor(opts: S3StorageAdapterOptions) {
		this.client = new S3Client({
			endpoint: opts.endpoint,
			region: opts.region,
			credentials: {
				accessKeyId: opts.accessKeyId,
				secretAccessKey: opts.secretAccessKey,
			},
			forcePathStyle: opts.forcePathStyle,
		})
		this.bucket = opts.bucket
		this.publicUrlBase = opts.publicUrlBase?.replace(/\/$/, '')
	}

	async upload(key: string, buffer: Buffer, contentType: string): Promise<void> {
		try {
			await this.client.send(
				new PutObjectCommand({
					Bucket: this.bucket,
					Key: key,
					Body: buffer,
					ContentType: contentType,
					// Keys contain a nonce, so the object at a given key is immutable
					// from the client's perspective. Safe to cache aggressively.
					CacheControl: 'public, max-age=31536000, immutable',
				})
			)
		} catch (error) {
			log.error({ err: error, key }, 'storage.put.failed')
			throw new UploadError('upstream', 'failed to upload object', error)
		}
	}

	async delete(key: string): Promise<void> {
		try {
			await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
		} catch (error) {
			// Callers log-and-continue; surface the error here so they can decide.
			throw new UploadError('upstream', `failed to delete object: ${key}`, error)
		}
	}

	async stream(key: string) {
		let out
		try {
			out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
		} catch (error) {
			const name = (error as { name?: string }).name
			if (name === 'NoSuchKey' || name === 'NotFound') {
				throw new UploadError('not-found', `no object at key: ${key}`, error)
			}
			throw new UploadError('upstream', 'failed to read object', error)
		}
		if (!out.Body) {
			throw new UploadError('upstream', 'empty body from storage')
		}
		return {
			body: out.Body as Readable,
			contentType: out.ContentType ?? 'application/octet-stream',
			etag: out.ETag ?? '',
			contentLength: out.ContentLength ?? 0,
		}
	}

	getPublicUrl(key: string): string {
		if (this.publicUrlBase) return `${this.publicUrlBase}/${key}`
		// Proxy path. Each segment encoded to survive slashes in keys like
		// `items/123/abc.webp`.
		return `/api/files/${key
			.split('/')
			.map(s => encodeURIComponent(s))
			.join('/')}`
	}

	async ready(): Promise<void> {
		await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }))
	}
}
