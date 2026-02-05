use spin_sdk::http::{IntoResponse, Request, Response};
use spin_sdk::http_component;
use image::{ImageOutputFormat, DynamicImage};
use std::io::Cursor;
use url::Url;

/// A dynamic image converter that supports multiple formats and resizing.
/// 
/// Query parameters:
/// - format: output format (png, jpeg, webp, gif, bmp, ico, tiff) - default: png
/// - width: target width in pixels (maintains aspect ratio if height not provided)
/// - height: target height in pixels (maintains aspect ratio if width not provided)
/// - quality: JPEG quality 1-100 (default: 90)
/// 
/// Example: POST /convert?format=jpeg&width=800&quality=85
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
        "jpeg" | "jpg" => (ImageOutputFormat::Jpeg(quality), "image/jpeg"),
        "png" => (ImageOutputFormat::Png, "image/png"),
        "webp" => (ImageOutputFormat::WebP, "image/webp"),
        "gif" => (ImageOutputFormat::Gif, "image/gif"),
        "bmp" => (ImageOutputFormat::Bmp, "image/bmp"),
        "ico" => (ImageOutputFormat::Ico, "image/x-icon"),
        "tiff" => (ImageOutputFormat::Tiff, "image/tiff"),
        _ => return Ok(Response::builder()
            .status(400)
            .header("content-type", "application/json")
            .body(format!(r#"{{"error": "Unsupported format: {}", "supported_formats": ["png", "jpeg", "webp", "gif", "bmp", "ico", "tiff"]}}"#, output_format))
            .build()),
    };
    
    let mut output = Vec::new();
    img.write_to(&mut Cursor::new(&mut output), img_format)
        .map_err(|e| anyhow::anyhow!("Failed to convert image to {}: {}", output_format, e))?;
    
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

