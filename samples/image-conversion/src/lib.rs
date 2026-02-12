use spin_sdk::http::{IntoResponse, Request, Response};
use spin_sdk::http_component;
use image::{
    ImageFormat, DynamicImage,
    codecs::{
        jpeg::JpegEncoder, 
        png::{PngEncoder, CompressionType, FilterType}
    }
};

use std::io::Cursor;
use url::Url;
// We use image-webp for WebP encoding since the main image crate doesn't support lossless encoding or quality control for WebP yet
use image_webp::{WebPEncoder, EncoderParams, ColorType};

/// A dynamic image converter that supports multiple formats and resizing.
/// 
/// Query parameters:
/// - format: output format (png, jpeg, webp, gif, bmp, ico, tiff) - default: png
/// - width: target width in pixels (maintains aspect ratio if height not provided)
/// - height: target height in pixels (maintains aspect ratio if width not provided)
/// - quality: 1-100 (default: 90)
/// - lossless: true/false (default: false, only applies to WebP)
/// 
/// Example: POST /convert?format=webp&width=800&quality=85
#[http_component]
fn handle_image_conversion(req: Request) -> anyhow::Result<impl IntoResponse> {
    match process_image(req) {
        Ok(response) => Ok(response),
        Err(e) => {
            eprintln!("Error processing image: {}", e);
            Ok(Response::builder()
                .status(500)
                .header("content-type", "application/json")
                .body(format!(r#"{{"error": "{}"}}"#, e))
                .build())
        }
    }
}

fn process_image(req: Request) -> anyhow::Result<Response> {
    let parsed_url = Url::parse(req.uri())
        .map_err(|e| anyhow::anyhow!("Failed to parse URI: {}", e))?;
    
    let mut output_format = "png".to_string();
    let mut width = None;
    let mut height = None;
    let mut quality = 90;
    let mut lossless = false;
    let mut validation_errors = Vec::new();
    
    for (key, value) in parsed_url.query_pairs() {
        match key.as_ref() {
            "format" => output_format = value.to_string(),
            "width" => {
                match value.parse::<u32>() {
                    Ok(w) if w > 0 => width = Some(w),
                    Ok(_) => validation_errors.push("Width must be greater than 0".to_string()),
                    Err(_) => validation_errors.push(format!("Invalid width value: {}", value)),
                }
            },
            "height" => {
                match value.parse::<u32>() {
                    Ok(h) if h > 0 => height = Some(h),
                    Ok(_) => validation_errors.push("Height must be greater than 0".to_string()),
                    Err(_) => validation_errors.push(format!("Invalid height value: {}", value)),
                }
            },
            "quality" => {
                match value.parse::<u8>() {
                    Ok(q) if q >= 1 && q <= 100 => quality = q,
                    Ok(q) => validation_errors.push(format!("Quality {} out of range (1-100)", q)),
                    Err(_) => validation_errors.push(format!("Invalid quality value: {}", value)),
                }
            },
            "lossless" => {
                match value.as_ref() {
                    "true"  => lossless = true,
                    "false" => lossless = false,
                    _ => validation_errors.push(format!("Invalid lossless value: {} (use true/false)", value)),
                }
            },
            _ => {}
        }
    }
    
    if !validation_errors.is_empty() {
        return Ok(Response::builder()
            .status(400)
            .header("content-type", "application/json")
            .body(format!(r#"{{"error": "Validation failed", "details": {}}}"#, 
                serde_json::to_string(&validation_errors).unwrap_or_else(|_| "[]".to_string())))
            .build());
    }
    
    let image_data = req.body();
    
    if image_data.is_empty() {
        return Ok(Response::builder()
            .status(400)
            .header("content-type", "application/json")
            .body(r#"{"error": "No image data provided", "hint": "Send image as POST body with optional query params: ?format=png&width=800&height=600&quality=90"}"#)
            .build());
    }
    
    // Load the image and autodetect format
    let mut img = image::load_from_memory(image_data.as_ref())
        .map_err(|e| anyhow::anyhow!("Failed to load image - invalid or unsupported format: {}", e))?;
    
    img = resize_image(img, width, height)?;
    
    let (img_format, content_type) = match output_format.to_lowercase().as_str() {
        "jpeg" | "jpg" => (ImageFormat::Jpeg, "image/jpeg"),
        "png" => (ImageFormat::Png, "image/png"),
        "webp" => (ImageFormat::WebP, "image/webp"),
        "gif" => (ImageFormat::Gif, "image/gif"),
        "bmp" => (ImageFormat::Bmp, "image/bmp"),
        "ico" => (ImageFormat::Ico, "image/x-icon"),
        "tiff" => (ImageFormat::Tiff, "image/tiff"),
        _ => return Ok(Response::builder()
            .status(400)
            .header("content-type", "application/json")
            .body(format!(r#"{{"error": "Unsupported format: {}", "supported_formats": ["png", "jpeg", "webp", "gif", "bmp", "ico", "tiff"]}}"#, output_format))
            .build()),
    };
    
    let mut output = Vec::new();
    let mut cursor = Cursor::new(&mut output);
    
    // Apply quality settings for formats that support it
    match img_format {
        ImageFormat::Jpeg => {
            let encoder = JpegEncoder::new_with_quality(&mut cursor, quality);
            img.write_with_encoder(encoder)
                .map_err(|e| anyhow::anyhow!("Failed to convert image to JPEG: {}", e))?;
        },
        ImageFormat::Png => {
            // Map quality (1-100) to compression level (1-9)
            let compression_level = ((quality as f32 / 100.0) * 8.0 + 1.0) as u8;
            let compression_level = compression_level.clamp(1, 9);
            
            let compression = CompressionType::Level(compression_level);
            let encoder = PngEncoder::new_with_quality(&mut cursor, compression, FilterType::default());
            img.write_with_encoder(encoder)
                .map_err(|e| anyhow::anyhow!("Failed to convert image to PNG: {}", e))?;
        },
        ImageFormat::WebP => {
            let mut params = EncoderParams::default();
            if !lossless {
                params.use_lossy = true;
                params.lossy_quality = quality;
            }
            
            let rgba = img.to_rgba8();
            let (width, height) = (rgba.width(), rgba.height());
            let mut encoder = WebPEncoder::new(&mut cursor);
            encoder.set_params(params);
            encoder.encode(rgba.as_raw(), width, height, ColorType::Rgba8)
                .map_err(|e| anyhow::anyhow!("Failed to convert image to WebP: {}", e))?;
        },
        _ => {
            img.write_to(&mut cursor, img_format)
                .map_err(|e| anyhow::anyhow!("Failed to convert image to {}: {}", output_format, e))?;
        }
    }
    
    println!("Converted image to {} ({}x{}) - {} bytes", 
             output_format, img.width(), img.height(), output.len());
    
    Ok(Response::builder()
        .status(200)
        .header("content-type", content_type)
        .body(output)
        .build())
}

fn resize_image(img: DynamicImage, width: Option<u32>, height: Option<u32>) -> anyhow::Result<DynamicImage> {
    match (width, height) {
        (Some(w), Some(h)) => {
            // Exact dimensions specified
            Ok(img.resize_exact(w, h, image::imageops::FilterType::Lanczos3))
        }
        (Some(w), None) => {
            // Width specified, maintain aspect ratio
            Ok(img.resize(w, u32::MAX, image::imageops::FilterType::Lanczos3))
        }
        (None, Some(h)) => {
            // Height specified, maintain aspect ratio
            Ok(img.resize(u32::MAX, h, image::imageops::FilterType::Lanczos3))
        }
        (None, None) => {
            // Return original if no resizing needed
            Ok(img)
        }
    }
}

