use std::ops::Add;
use std::time::{Duration, SystemTime};

use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::error::{err_inv, Error};

macro_rules! impl_segment {
    () => {
        pub fn new(json: Value) -> Self {
            Self { json }
        }

        pub fn get_str(&self, key: &str) -> Option<&str> {
            self.json.get(key)?.as_str()
        }

        pub fn get_i64(&self, key: &str) -> Option<i64> {
            self.json.get(key)?.as_i64()
        }

        pub fn get_u64(&self, key: &str) -> Option<u64> {
            self.json.get(key)?.as_u64()
        }

        pub fn get_f64(&self, key: &str) -> Option<f64> {
            self.json.get(key)?.as_f64()
        }

        pub fn get_bool(&self, key: &str) -> Option<bool> {
            self.json.get(key)?.as_bool()
        }

        pub fn get_object(&self, key: &str) -> Option<&Map<String, Value>> {
            self.json.get(key)?.as_object()
        }

        pub fn get_array(&self, key: &str) -> Option<&Vec<Value>> {
            self.json.get(key)?.as_array()
        }

        pub fn get_null(&self, key: &str) -> Option<()> {
            self.json.get(key)?.as_null()
        }

        pub fn into<T: DeserializeOwned>(&self) -> Result<T, Error> {
            Ok(serde_json::from_value::<T>(self.json.clone()).or(Err(err_inv("Failed to deserialize segment")))?)
        }
    };
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Header {
    pub(crate) json: Value,
}

impl Header {
    impl_segment!();

    pub fn alg(&self) -> Option<&str> {
        self.get_str("alg")
    }

    pub fn enc(&self) -> Option<&str> {
        self.get_str("enc")
    }

    pub fn zip(&self) -> Option<&str> {
        self.get_str("zip")
    }

    pub fn jku(&self) -> Option<&str> {
        self.get_str("jku")
    }

    pub fn jkw(&self) -> Option<&str> {
        self.get_str("jkw")
    }

    pub fn kid(&self) -> Option<&str> {
        self.get_str("kid")
    }

    pub fn x5u(&self) -> Option<&str> {
        self.get_str("x5u")
    }

    pub fn x5c(&self) -> Option<&str> {
        self.get_str("x5c")
    }

    pub fn x5t(&self) -> Option<&str> {
        self.get_str("x5t")
    }

    pub fn typ(&self) -> Option<&str> {
        self.get_str("typ")
    }

    pub fn cty(&self) -> Option<&str> {
        self.get_str("cty")
    }

    pub fn crit(&self) -> Option<&str> {
        self.get_str("crit")
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Payload {
    pub(crate) json: Value,
}

impl Payload {
    impl_segment!();

    pub fn iss(&self) -> Option<&str> {
        self.get_str("iss")
    }

    pub fn sub(&self) -> Option<&str> {
        self.get_str("sub")
    }

    pub fn aud(&self) -> Option<&str> {
        self.get_str("aud")
    }

    pub fn exp(&self) -> Option<u64> {
        self.get_f64("exp").and_then(|f| Some(f as u64))
    }

    pub fn nbf(&self) -> Option<u64> {
        self.get_f64("nbf").and_then(|f| Some(f as u64))
    }

    pub fn iat(&self) -> Option<u64> {
        self.get_f64("iat").and_then(|f| Some(f as u64))
    }

    pub fn jti(&self) -> Option<&str> {
        self.get_str("jti")
    }

    pub fn expiry(&self) -> Option<SystemTime> {
        if let Some(time) = self.exp() {
            Some(SystemTime::UNIX_EPOCH.add(Duration::new(time, 0)))
        } else {
            None
        }
    }

    pub fn issued_at(&self) -> Option<SystemTime> {
        if let Some(time) = self.iat() {
            Some(SystemTime::UNIX_EPOCH.add(Duration::new(time, 0)))
        } else {
            None
        }
    }

    pub fn not_before(&self) -> Option<SystemTime> {
        if let Some(time) = self.nbf() {
            Some(SystemTime::UNIX_EPOCH.add(Duration::new(time, 0)))
        } else {
            None
        }
    }

    pub fn has_claim(&self, key: String) -> bool {
        match self.json.get(key) {
            Some(_) => true,
            None => false,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Jwt {
    header: Header,
    payload: Payload,
    signature: String,
}

impl Jwt {
    pub fn new(header: Header, payload: Payload, signature: String) -> Self {
        Jwt { header, payload, signature }
    }

    pub fn header(&self) -> &Header {
        &self.header
    }

    pub fn payload(&self) -> &Payload {
        &self.payload
    }

    pub fn signature(&self) -> &String {
        &self.signature
    }

    pub fn expired(&self) -> Option<bool> {
        self.expired_time(SystemTime::now())
    }

    pub fn expired_time(&self, time: SystemTime) -> Option<bool> {
        match self.payload.expiry() {
            Some(token_time) => Some(time > token_time),
            None => None,
        }
    }

    pub fn early(&self) -> Option<bool> {
        self.early_time(SystemTime::now())
    }

    pub fn early_time(&self, time: SystemTime) -> Option<bool> {
        match self.payload.not_before() {
            Some(token_time) => Some(time < token_time),
            None => None,
        }
    }

    pub fn issued_by(&self, issuer: &str) -> Option<bool> {
        match self.payload.iss() {
            Some(t) => Some(t == issuer),
            None => None,
        }
    }

    pub fn valid(&self) -> Option<bool> {
        self.valid_time(SystemTime::now())
    }

    pub fn valid_time(&self, time: SystemTime) -> Option<bool> {
        Some(!self.expired_time(time)? && !self.early_time(time)?)
    }
}