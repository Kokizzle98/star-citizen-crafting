import {NextResponse} from 'next/server';import {createSupabaseServerClient} from '@/lib/supabase/server'
export async function POST(req:Request){const supabase=createSupabaseServerClient();await supabase.auth.signOut();const origin=process.env.APP_ORIGIN||new URL(req.url).origin;return NextResponse.redirect(new URL('/login',origin),303)}
