const { supabase } = require('../server/config/supabase');

async function testQuery() {
  console.log('Testing raw properties query...');
  const { data, error } = await supabase
    .from('properties')
    .select('*');
  
  if (error) {
    console.error('Error raw properties:', error);
  } else {
    console.log('Raw properties count:', data ? data.length : 0);
    console.log('Raw properties data:', data ? data.slice(0, 2) : []);
  }

  console.log('Testing joined query...');
  const { data: joinedData, error: joinedError } = await supabase
    .from('properties')
    .select(`
      *,
      property_features(feature_name),
      property_images(image_url)
    `);

  if (joinedError) {
    console.error('Error joined query:', joinedError);
  } else {
    console.log('Joined properties count:', joinedData ? joinedData.length : 0);
  }
}

testQuery();
