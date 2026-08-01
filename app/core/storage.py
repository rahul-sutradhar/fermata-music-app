from __future__ import annotations

from fastapi import UploadFile

from app.core.config import settings

try:
    import boto3
    from botocore.exceptions import BotoCoreError, ClientError
except ImportError:  # pragma: no cover
    boto3 = None
    BotoCoreError = ClientError = Exception


def _validate_b2_configuration() -> None:
    if boto3 is None:
        raise RuntimeError("boto3 is required for Backblaze B2 storage")
    if not settings.b2_s3_endpoint_url:
        raise RuntimeError("B2 S3 endpoint URL is not configured")
    if not settings.b2_access_key_id or not settings.b2_secret_access_key:
        raise RuntimeError("B2 credentials are not configured")
    if not settings.b2_bucket_name:
        raise RuntimeError("B2 bucket name is not configured")


_b2_client = None


def get_b2_client():
    global _b2_client
    if _b2_client is not None:
        return _b2_client
    _validate_b2_configuration()
    _b2_client = boto3.client(
        "s3",
        endpoint_url=settings.b2_s3_endpoint_url,
        aws_access_key_id=settings.b2_access_key_id,
        aws_secret_access_key=settings.b2_secret_access_key,
        region_name=settings.b2_region_name,
    )
    return _b2_client


def upload_audio_file(file: UploadFile, object_key: str) -> str:
    client = get_b2_client()
    content_type = file.content_type or "application/octet-stream"
    try:
        client.upload_fileobj(
            file.file,
            settings.b2_bucket_name,
            object_key,
            ExtraArgs={"ContentType": content_type},
        )
    except (BotoCoreError, ClientError) as exc:
        raise RuntimeError("Failed to upload audio file to Backblaze B2") from exc
    return object_key


def upload_local_file(local_path: str, object_key: str, content_type: str) -> str:
    client = get_b2_client()
    try:
        with open(local_path, "rb") as f:
            client.upload_fileobj(
                f,
                settings.b2_bucket_name,
                object_key,
                ExtraArgs={"ContentType": content_type},
            )
    except (BotoCoreError, ClientError) as exc:
        raise RuntimeError("Failed to upload local file to Backblaze B2") from exc
    return object_key


def get_audio_url(object_key: str, expires_in: int = 3600, version: int | None = None) -> str | None:
    if not object_key:
        return None
    if settings.cdn_url:
        cdn_base = settings.cdn_url.rstrip("/")
        obj_key_clean = object_key.lstrip("/")
        url = f"{cdn_base}/{obj_key_clean}"
        if version:
            sep = "&" if "?" in url else "?"
            return f"{url}{sep}v={version}"
        return url
    try:
        client = get_b2_client()
    except RuntimeError:
        return None
    try:
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.b2_bucket_name, "Key": object_key},
            ExpiresIn=expires_in,
        )
    except (BotoCoreError, ClientError):
        return None


def generate_presigned_put_url(object_key: str, expires_in: int = 300, content_type: str | None = None) -> str | None:
    """Generate a presigned PUT URL for uploading a file directly to B2/S3.

    Returns None if generation fails or configuration is missing.
    """
    try:
        client = get_b2_client()
    except RuntimeError:
        return None
    params = {"Bucket": settings.b2_bucket_name, "Key": object_key}
    if content_type:
        params["ContentType"] = content_type
    try:
        return client.generate_presigned_url(
            "put_object",
            Params=params,
            ExpiresIn=expires_in,
        )
    except (BotoCoreError, ClientError):
        return None


def delete_audio_file(object_key: str) -> None:
    if not object_key:
        return
    client = get_b2_client()
    try:
        client.delete_object(Bucket=settings.b2_bucket_name, Key=object_key)
    except (BotoCoreError, ClientError) as exc:
        raise RuntimeError("Failed to delete audio file from Backblaze B2") from exc


def delete_objects_with_prefix(prefix: str) -> None:
    """Deletes all objects in Backblaze B2 matching the given key prefix."""
    if not prefix:
        return
    client = get_b2_client()
    try:
        paginator = client.get_paginator("list_objects_v2")
        pages = paginator.paginate(Bucket=settings.b2_bucket_name, Prefix=prefix)
        
        objects_to_delete = []
        for page in pages:
            if "Contents" in page:
                for obj in page["Contents"]:
                    objects_to_delete.append({"Key": obj["Key"]})
                    
        if objects_to_delete:
            for i in range(0, len(objects_to_delete), 1000):
                batch = objects_to_delete[i:i + 1000]
                client.delete_objects(
                    Bucket=settings.b2_bucket_name,
                    Delete={"Objects": batch}
                )
    except (BotoCoreError, ClientError) as exc:
        raise RuntimeError(f"Failed to delete files with prefix {prefix} from Backblaze B2") from exc

