/**
 * Test Basic Route - Not MCP
 */

import { NextResponse } from 'next/server';

export async function GET() {
  console.log('📍 Simple test route GET called');
  return NextResponse.json({
    message: "Simple test route works",
    timestamp: new Date().toISOString(),
    note: "This proves routing works for /api/simple"
  });
}