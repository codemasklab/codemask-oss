class Customer:
    def __init__(self, customer_id, email, customer_name, api_key):
        self.customer_id = customer_id
        self.email = email
        self.customer_name = customer_name
        self.api_key = api_key

def process_customer(customer):
    customer_email = customer.email
    api_key = customer.api_key
    customer_name = customer.customer_name
    
    print(f"Processing {customer_name} with email {customer_email}")
    print(f"API Key: {api_key}")
    
    send_email(customer_email, customer_name)

def send_email(email, name):
    # Send email logic
    print(f"Sending to {email} for {name}")

customer = Customer(
    customer_id='123e4567-e89b-12d3-a456-426614174000',
    email='customer@example.com',
    customer_name='John Doe',
    api_key='sk_live_abc123xyz789'
)

process_customer(customer)

