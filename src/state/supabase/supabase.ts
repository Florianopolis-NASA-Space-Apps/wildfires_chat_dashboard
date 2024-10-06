import { createClient } from '@supabase/supabase-js';

// Replace with your Supabase credentials
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || '';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const fetchObservations = async (query: string) => {
  try {
    // Query the observations table

    let { count, error } = await supabase
      .from('observations')
      .select('*', { count: 'exact' });

    if (error) throw error;

    return count;
  } catch (error) {
    // Handle the error
    console.log('some error', { error });
  }
};
