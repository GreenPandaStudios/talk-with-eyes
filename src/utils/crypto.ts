function xor(data1: Uint8Array, data2: Uint8Array): Uint8Array {
    if (data1.length !== data2.length) {
        throw new Error("Input arrays must have the same length");
    }

    const result = new Uint8Array(data1.length);
    for (let i = 0; i < data1.length; i++) {
        result[i] = data1[i] ^ data2[i];
    }
    return result;
}

/**
 * XOR cipher that works with a password of any length. Since XOR is reversible,
 * applying the same password twice will restore the original data.
 * This function can be used for both encryption and decryption.
 * 
 * @param data - The data to encrypt or decrypt
 * @param password - The password to use for the XOR operation
 * @returns The encrypted or decrypted data
 */
export function xorCipher(data: Uint8Array | string, password: Uint8Array | string): Uint8Array {
    // Convert inputs to Uint8Array if they are strings
    const dataArray = typeof data === 'string' ? fromString(data) : data;
    const passwordArray = typeof password === 'string' ? fromString(password) : password;
    
    const result = new Uint8Array(dataArray.length);
    
    // XOR each byte of data with the corresponding byte from the password (repeating if needed)
    for (let i = 0; i < dataArray.length; i++) {
        result[i] = dataArray[i] ^ passwordArray[i % passwordArray.length];
    }
    
    return result;
}

function toString(data: Uint8Array): string {
    return new TextDecoder().decode(data);
}

function fromString(str: string): Uint8Array {
    return new TextEncoder().encode(str);
}

async function sha256(data: string): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const dataArray = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest("SHA-256", dataArray);
    return new Uint8Array(hashBuffer);
}

/**
 * Encrypt a string using the XOR cipher and return the result as a hex string
 * 
 * @param text - The text to encrypt
 * @param password - The password to use for encryption
 * @returns The encrypted data as a hex string
 */
export async function encryptToHex(text: string, password: string): Promise<string> {
    const encrypted = xorCipher(text, await sha256(password));
    return Array.from(encrypted)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Decrypt a hex string using the XOR cipher
 * 
 * @param hexString - The hex string to decrypt
 * @param password - The password to use for decryption
 * @returns The decrypted string
 */
export async function decryptFromHex(hexString: string, password: string): Promise<string> {
    // Convert hex string to Uint8Array
    const bytes = new Uint8Array(hexString.length / 2);
    for (let i = 0; i < hexString.length; i += 2) {
        bytes[i / 2] = parseInt(hexString.substring(i, i + 2), 16);
    }
    
    // Decrypt using XOR cipher
    const decrypted = xorCipher(bytes, await sha256(password));
    return toString(decrypted);
}


const ENCRYPTED_OPENAI_API_KEY = "6dafc0730509c03530d70c986bd89a167a0be51580b67fecc8433f5f9746c28166a1ba42322ed84e59e719fd3dd09f562b3e864f948b00abe6103b20b536bb99519489353253f82959d912ef57dc9f005318874eafac2ef3e33c2852b619d4946cb4bf4d440fc82a2fbb76ea66cd86374e10be4d98a505f3f720192aea19ec8f7186bf3b351ee32957d706e662ebb2206e1398158e961da1e2402a0be13fed8868aad942"

/**
 * This function derives an OpenAI API key from a given password using a simple XOR-based method.
 * @param password - The password to derive the API key from.
 * @returns The derived OpenAI API key.
 */
export async function getOpenAIApiKeyFromPassword(password: string): Promise<string> {
    return await decryptFromHex(ENCRYPTED_OPENAI_API_KEY, password);
}

// Export utility functions
export { xor, toString, fromString };
