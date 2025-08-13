/**
 * JSON Web Key Set (JWKS) Endpoint
 * RFC 7517 - JSON Web Key (JWK)
 * Since we're using HMAC (HS256), this endpoint returns an empty key set
 * In production with RS256, this would contain the public key
 */

import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // For HMAC (HS256) we don't expose the symmetric key
    // This endpoint is for compatibility but returns empty key set
    const jwks = {
      keys: []
    };
    
    console.log('📄 JWKS endpoint requested (HMAC - empty key set)');
    
    return NextResponse.json(jwks, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      }
    });
  } catch (error) {
    console.error('❌ Error serving JWKS:', error);
    
    return NextResponse.json({
      error: 'server_error',
      error_description: 'Failed to retrieve JSON Web Key Set'
    }, { 
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}