function validateLength(value, fieldName, min, max) {
  if (!value || typeof value !== 'string') return `${fieldName} is required`;
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    return `${fieldName} must be between ${min} and ${max} characters`;
  }
  return null;
}

function validateEmail(email) {
  if (!email || typeof email !== 'string') return 'Email is required';
  const trimmed = email.trim();
  if (trimmed.length < 3 || trimmed.length > 255) return 'Email must be between 3 and 255 characters';
  const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(trimmed)) return 'Email format is invalid';
  return null;
}

function validatePassword(password) {
  return validateLength(password, 'Password', 6, 255);
}

function validateName(name) {
  return validateLength(name, 'Name', 1, 255);
}

function validateCompanyName(name) {
  return validateLength(name, 'Company name', 1, 255);
}

function validateLoginRequest(body) {
  return validateEmail(body?.email) || validatePassword(body?.password) || null;
}

function validateRegisterRequest(body) {
  return validateEmail(body?.email) || 
         validatePassword(body?.password) || 
         validateName(body?.name) || 
         validateCompanyName(body?.companyName) || 
         null;
}

module.exports = {
  validateEmail,
  validatePassword,
  validateName,
  validateCompanyName,
  validateLoginRequest,
  validateRegisterRequest,
};