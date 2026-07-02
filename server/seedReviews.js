const { supabase } = require('./config/supabase');
const bcrypt = require('bcrypt');

const seed = async () => {
  console.log('Seeding reviews and reviewer users...');
  
  // 1. Hash password for reviewer users
  const hashedPassword = await bcrypt.hash('mockpassword123', 10);
  
  // 2. Define reviewer users
  const reviewers = [
    { name: 'Courtney Henry', email: 'courtney.henry@estate.test', password: hashedPassword, role: 'USER', verification_status: 'VERIFIED' },
    { name: 'Jerome Bell', email: 'jerome.bell@estate.test', password: hashedPassword, role: 'USER', verification_status: 'VERIFIED' },
    { name: 'Albert Flores', email: 'albert.flores@estate.test', password: hashedPassword, role: 'USER', verification_status: 'VERIFIED' }
  ];
  
  const userIds = {};
  
  for (const reviewer of reviewers) {
    // Check if user exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', reviewer.email)
      .maybeSingle();
      
    if (existingUser) {
      console.log(`User ${reviewer.name} already exists with ID ${existingUser.id}`);
      userIds[reviewer.name] = existingUser.id;
    } else {
      const { data: newUser, error } = await supabase
        .from('users')
        .insert([reviewer])
        .select()
        .single();
        
      if (error) {
        console.error(`Error inserting user ${reviewer.name}:`, error.message);
      } else {
        console.log(`Created user ${reviewer.name} with ID ${newUser.id}`);
        userIds[reviewer.name] = newUser.id;
      }
    }
  }
  
  // 3. Define reviews for properties owned by Zân Cao (user ID 12)
  // Zân Cao owns properties: 1, 2, 3
  const now = new Date();
  
  const reviews = [
    {
      property_id: 1,
      user_id: userIds['Courtney Henry'],
      rating: 5,
      comment: 'Nisl Nisi Pulvinar Dui Justo, Lorem. Sed Quam Eu Cras At. Sed Quis Id Mauris Massa. Eros, Nec Egestas Vestibulum Augue Aenean Arcu Leo Vulputate. Magna Feugiat Ac Adipiscing Mattis Velit Facilisi Metus. Dolor Urna, Mi At Tincidunt. Nulla.',
      status: 'APPROVED',
      is_verified_review: true,
      created_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() // 2 days ago
    },
    {
      property_id: 2,
      user_id: userIds['Jerome Bell'],
      rating: 5,
      comment: 'Aenean Arcu Leo Vulputate. Magna Feugiat Ac Adipiscing Mattis Velit Facilisi Metus. Dolor Urna, Mi At Tincidunt. Nulla. Rất hài lòng với các thủ tục pháp lý mà Zân hỗ trợ. Nhanh gọn, minh bạch và rõ ràng. Sẽ quay lại hợp tác trong tương lai.',
      status: 'APPROVED',
      is_verified_review: true,
      created_at: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString() // 1 week ago
    },
    {
      property_id: 3,
      user_id: userIds['Albert Flores'],
      rating: 4,
      comment: 'Căn hộ sạch sẽ, thoáng mát, đầy đủ tiện nghi. Anh Zân hỗ trợ rất nhanh các thủ tục đăng ký tạm trú.',
      status: 'APPROVED',
      is_verified_review: true,
      created_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString() // 3 days ago
    }
  ];
  
  for (const review of reviews) {
    if (!review.user_id) {
      console.error(`Skipping review for property ${review.property_id} because reviewer user_id is missing.`);
      continue;
    }
    
    // Check if review already exists
    const { data: existingReview } = await supabase
      .from('property_reviews')
      .select('id')
      .eq('property_id', review.property_id)
      .eq('user_id', review.user_id)
      .maybeSingle();
      
    if (existingReview) {
      console.log(`Review for property ${review.property_id} by user ${review.user_id} already exists.`);
    } else {
      const { error } = await supabase
        .from('property_reviews')
        .insert([review]);
        
      if (error) {
        console.error(`Error inserting review for property ${review.property_id}:`, error.message);
      } else {
        console.log(`Created review for property ${review.property_id}`);
      }
    }
  }
  
  console.log('Seeding finished successfully.');
};

seed().catch(console.error);
