## 6.6. PaymentsBook

### 6.6.1 Events

The following events are emitted by the `PaymentsBook`:

#### 6.6.1.1. Payment received

- **Name:** `PaymentReceived`
- **Args:**
    - **Period ID:** Identification number of the payment period when the payment was received
    - **Payer:** Address paying on behalf of
    - **Token:** Address of the token used for the payment
    - **Amount:** Amount of tokens being paid
    - **Data:** Arbitrary data

#### 6.6.1.2. Guardian share claimed

- **Name:** `GuardianShareClaimed`
- **Args:**
    - **Period ID:** Identification number of the payment period claimed by the guardian
    - **Guardian:** Address of the guardian claiming their share
    - **Token:** Address of the token used for the share
    - **Amount:** Amount of tokens the guardian received for the requested period

#### 6.6.1.3. Governor share claimed

- **Name:** `GovernorShareClaimed`
- **Args:**
    - **Period ID:** Identification number of the payment period claimed by the governor
    - **Token:** Address of the token used for the share
    - **Amount:** Amount of tokens transferred to the governor address

#### 6.6.1.4. Governor share changed

- **Name:** `GovernorSharePctChanged`
- **Args:**
    - **Previous governor share:** Previous permyriad of collected payments that was being allocated to the governor
    - **Current governor share:** Current permyriad of collected payments that will be allocated to the governor

### 6.6.2. Getters

The following functions are state getters provided by the `PaymentsBook`:

#### 6.6.2.1. Period duration

- **Inputs:** None
- **Pre-flight checks:** None
- **Outputs:**
    - **Duration:** Duration of a payment period in Court terms

#### 6.6.2.2. Governor share

- **Inputs:** None
- **Pre-flight checks:** None
- **Outputs:**
    - **Governor share:** Permyriad of collected payments that will be allocated to the governor of the Court (‱ - 1/10,000)

#### 6.6.2.3. Current period ID

- **Inputs:** None
- **Pre-flight checks:**
    - Ensure that the Court first term has already started
- **Outputs:**
    - **Period ID:** Identification number of the current period

#### 6.6.2.4. Period shares details

- **Inputs:**
    - **Period ID:** Identification number of the period being queried
    - **Token:** Address of the token being queried
- **Pre-flight checks:** None
- **Outputs:**
    - **Guardians share:** Total amount collected for the guardians during a period
    - **Governor share:** Total amount collected for the governor during a period

#### 6.6.2.5. Period balance details

- **Inputs:**
    - **Period ID:** Identification number of the period being queried
- **Pre-flight checks:** None
- **Outputs:**
    - **Balance checkpoint:** Court term ID of a period used to fetch the total active balance of the guardians registry
    - **Total active balance:** Total amount of guardian tokens active in the Court at the corresponding period checkpoint

#### 6.6.2.6. Guardian share

- **Inputs:**
    - **Period ID:** Identification number of the period being queried
    - **Guardian:** Address of the guardian querying the owed shared of
    - **Tokens:** List of addresses of the tokens being queried
- **Pre-flight checks:**
    - Ensure that the balance details of the requested period have been ensured
- **Outputs:**
    - **Amounts:** List of token amounts collected for the guardian in the given period

#### 6.6.2.7. Can guardian claim

- **Inputs:**
    - **Period ID:** Identification number of the period being queried
    - **Guardian:** Address of the guardian querying the owed shared of
    - **Tokens:** List of addresses of the tokens being queried
- **Pre-flight checks:** None
- **Outputs:**
    - **Claimed:** List of results considering true if the guardian's share can be claimed for the given period and token, false otherwise

#### 6.6.2.8. Governor share

- **Inputs:**
    - **Period ID:** Identification number of the period being queried
    - **Tokens:** List of addresses of the tokens being queried
- **Pre-flight checks:** None
- **Outputs:**
    - **Amounts:** List of token amount collected for the governor in the given period

#### 6.6.2.9. Can governor claim

- **Inputs:**
    - **Period ID:** Identification number of the period being queried
    - **Tokens:** List of addresses of the tokens being queried
- **Pre-flight checks:** None
- **Outputs:**
    - **Claimed:** List of results considering true if the governor's share can be claimed for the given period and token, false otherwise
